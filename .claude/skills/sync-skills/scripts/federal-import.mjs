import { execFile as executeFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(executeFile);
const SKILLS_PATH = path.join(".claude", "skills");
const SKILL_MARKDOWN = "SKILL.md";
export const DEFAULT_PUBLISHED_SOURCE_URL =
  "https://github.com/SPHERE-DI/skillset.git";

export class FederalSourceUnavailableError extends Error {
  constructor(options) {
    super(
      `La source de Skills fédérales publiée est inaccessible à ${DEFAULT_PUBLISHED_SOURCE_URL} (origin/main).`,
      options,
    );
  }
}

export class LocalSourceApprovalRequiredError extends Error {
  constructor(location) {
    super(
      `La source de Skills fédérales machine-locale exige une approbation explicite : ${path.resolve(location)}.`,
    );
  }
}

export async function planFederalImport({
  provinceRoot,
  localSourceRoot,
  localSourceApproved = false,
  materializePublishedSource = clonePublishedSource,
}) {
  const checkoutRoot = await mkdtemp(
    path.join(os.tmpdir(), "skillset-federal-source-"),
  );

  try {
    let sourceRoot = checkoutRoot;
    let source;
    if (localSourceRoot) {
      if (!localSourceApproved) {
        throw new LocalSourceApprovalRequiredError(localSourceRoot);
      }

      sourceRoot = path.resolve(localSourceRoot);
      const sourceCommit = (
        await execFile("git", ["rev-parse", "HEAD"], { cwd: sourceRoot })
      ).stdout.trim();
      source = {
        kind: "local",
        location: sourceRoot,
        revision: "working-tree",
        commit: sourceCommit,
      };
    } else {
      try {
        await materializePublishedSource(checkoutRoot);
      } catch (error) {
        throw new FederalSourceUnavailableError({ cause: error });
      }
      const sourceCommit = (
        await execFile("git", ["rev-parse", "origin/main"], {
          cwd: checkoutRoot,
        })
      ).stdout.trim();
      source = {
        kind: "published",
        location: DEFAULT_PUBLISHED_SOURCE_URL,
        revision: "origin/main",
        commit: sourceCommit,
      };
    }
    const sourceSkillsRoot = path.join(sourceRoot, SKILLS_PATH);
    const provinceSkillsRoot = path.join(provinceRoot, SKILLS_PATH);
    const sourceSkills = await listDirectories(sourceSkillsRoot);
    const provinceSkills = await listDirectoriesIfPresent(provinceSkillsRoot);
    const additions = [];
    const updates = [];
    const removals = [];
    const blockingModifications = [];
    const federalSourceSkills = [];
    const sourceRevision = source.kind === "published" ? source.revision : "HEAD";

    for (const skill of sourceSkills) {
      if (!(await isFederalSkill(path.join(sourceSkillsRoot, skill)))) {
        continue;
      }
      federalSourceSkills.push(skill);
      if (!provinceSkills.includes(skill)) {
        additions.push({
          skill,
          differences: (await listFiles(path.join(sourceSkillsRoot, skill))).map(
            (filePath) => ({ path: filePath, status: "added" }),
          ),
        });
        continue;
      }

      const differences = await comparePackages({
        sourceRepository: sourceRoot,
        provinceRepository: provinceRoot,
        skill,
      });
      if (differences.length > 0) {
        const matchesHistoricalVersion = await matchesHistoricalFederalPackage({
          sourceRepository: sourceRoot,
          sourceRevision,
          skill,
          provinceRepository: provinceRoot,
        });
        const destination = matchesHistoricalVersion
          ? updates
          : blockingModifications;
        destination.push({ skill, differences });
      }
    }

    for (const skill of provinceSkills) {
      const provinceSkillRoot = path.join(provinceSkillsRoot, skill);
      if (
        federalSourceSkills.includes(skill) ||
        !(await isFederalSkill(provinceSkillRoot))
      ) {
        continue;
      }
      const matchesHistoricalVersion = await matchesHistoricalFederalPackage({
        sourceRepository: sourceRoot,
        sourceRevision,
        skill,
        provinceRepository: provinceRoot,
      });
      const destination = matchesHistoricalVersion
        ? removals
        : blockingModifications;
      destination.push({
        skill,
        differences: (await listFiles(provinceSkillRoot)).map((filePath) => ({
          path: filePath,
          status: "removed",
        })),
      });
    }

    return {
      source,
      additions,
      updates,
      removals,
      blockingModifications,
    };
  } finally {
    await rm(checkoutRoot, { recursive: true, force: true });
  }
}

async function matchesHistoricalFederalPackage({
  sourceRepository,
  sourceRevision,
  skill,
  provinceRepository,
}) {
  const skillPath = toRepositoryPath(path.join(SKILLS_PATH, skill));
  const provinceSkillRoot = path.join(provinceRepository, SKILLS_PATH, skill);
  const { stdout } = await execFile(
    "git",
    ["rev-list", sourceRevision, "--", skillPath],
    { cwd: sourceRepository },
  );
  const provinceFiles = await listFiles(provinceSkillRoot);

  for (const commit of stdout.split(/\r?\n/).filter(Boolean)) {
    let skillMarkdown;
    try {
      skillMarkdown = (
        await execFile(
          "git",
          ["show", `${commit}:${skillPath}/${SKILL_MARKDOWN}`],
          { cwd: sourceRepository },
        )
      ).stdout;
    } catch {
      continue;
    }
    if (!isFederalContent(skillMarkdown)) {
      continue;
    }

    const { stdout: treeOutput } = await execFile(
      "git",
      ["ls-tree", "-r", "-z", commit, "--", skillPath],
      { cwd: sourceRepository },
    );
    const sourceEntries = treeOutput
      .split("\0")
      .filter(Boolean)
      .map((entry) => {
        const [metadata, filePath] = entry.split("\t");
        return {
          filePath: filePath.slice(skillPath.length + 1),
          objectId: metadata.split(" ")[2],
        };
      })
      .sort((left, right) =>
        left.filePath < right.filePath
          ? -1
          : left.filePath > right.filePath
            ? 1
            : 0,
      );
    const sourceFiles = sourceEntries.map(({ filePath }) => filePath);
    if (
      sourceFiles.length !== provinceFiles.length ||
      sourceFiles.some((filePath, index) => filePath !== provinceFiles[index])
    ) {
      continue;
    }

    let matches = true;
    for (const { filePath, objectId } of sourceEntries) {
      const provinceObjectId = await hashWorkingTreeFile({
        repositoryRoot: provinceRepository,
        repositoryPath: `${skillPath}/${filePath}`,
        filePath: path.join(provinceSkillRoot, filePath),
      });
      if (objectId !== provinceObjectId) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return true;
    }
  }

  return false;
}

async function comparePackages({
  sourceRepository,
  provinceRepository,
  skill,
}) {
  const sourcePackageRoot = path.join(sourceRepository, SKILLS_PATH, skill);
  const provincePackageRoot = path.join(provinceRepository, SKILLS_PATH, skill);
  const sourceFiles = await listFiles(sourcePackageRoot);
  const targetFiles = await listFiles(provincePackageRoot);
  const files = [...new Set([...sourceFiles, ...targetFiles])].sort();
  const differences = [];

  for (const filePath of files) {
    if (!targetFiles.includes(filePath)) {
      differences.push({ path: filePath, status: "added" });
      continue;
    }
    if (!sourceFiles.includes(filePath)) {
      differences.push({ path: filePath, status: "removed" });
      continue;
    }

    const repositoryPath = toRepositoryPath(
      path.join(SKILLS_PATH, skill, filePath),
    );
    const [sourceObjectId, targetObjectId] = await Promise.all([
      hashWorkingTreeFile({
        repositoryRoot: sourceRepository,
        repositoryPath,
        filePath: path.join(sourcePackageRoot, filePath),
      }),
      hashWorkingTreeFile({
        repositoryRoot: provinceRepository,
        repositoryPath,
        filePath: path.join(provincePackageRoot, filePath),
      }),
    ]);
    if (sourceObjectId !== targetObjectId) {
      differences.push({ path: filePath, status: "updated" });
    }
  }

  return differences;
}

async function hashWorkingTreeFile({
  repositoryRoot,
  repositoryPath,
  filePath,
}) {
  const { stdout } = await execFile(
    "git",
    ["hash-object", `--path=${repositoryPath}`, "--", filePath],
    { cwd: repositoryRoot },
  );
  return stdout.trim();
}

async function isFederalSkill(skillRoot) {
  const content = await readFile(path.join(skillRoot, SKILL_MARKDOWN), "utf8");
  return isFederalContent(content);
}

function isFederalContent(content) {
  const frontmatter = content.match(
    /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/,
  )?.[1];
  return /^status:\s*federal\s*(?:#.*)?$/m.test(frontmatter ?? "");
}

async function listDirectories(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function listDirectoriesIfPresent(root) {
  try {
    return await listDirectories(root);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function listFiles(root) {
  const files = [];
  await visit(root, "", files);
  return files.map(toRepositoryPath).sort();
}

async function visit(root, relativePath, files) {
  const entries = await readdir(path.join(root, relativePath), {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const entryPath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      await visit(root, entryPath, files);
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
}

function toRepositoryPath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function clonePublishedSource(checkoutRoot) {
  await execFile(
    "git",
    [
      "-c",
      "core.autocrlf=false",
      "clone",
      "--quiet",
      "--branch",
      "main",
      "--single-branch",
      "--",
      DEFAULT_PUBLISHED_SOURCE_URL,
      checkoutRoot,
    ],
    { cwd: os.tmpdir() },
  );
}

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  if (action !== "plan") {
    throw new Error(
      "Usage: federal-import.mjs plan [--province-root <path>] [--local-source <path> --approve-local-source]",
    );
  }

  const knownOptions = new Set([
    "--province-root",
    "--local-source",
    "--approve-local-source",
  ]);
  const unknownOption = args.find(
    (argument) => argument.startsWith("--") && !knownOptions.has(argument),
  );
  if (unknownOption) {
    throw new Error(`Unknown option: ${unknownOption}.`);
  }

  const plan = await planFederalImport({
    provinceRoot: path.resolve(
      readOption(args, "--province-root") ?? process.cwd(),
    ),
    localSourceRoot: readOption(args, "--local-source"),
    localSourceApproved: args.includes("--approve-local-source"),
  });
  console.log(JSON.stringify(plan, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
