---
name: sync-skills
status: skillset-specific
provinces: [skillset]
description: Check or rebuild skillset's Codex projection, or plan an import of Skills fédérales in a Province.
disable-model-invocation: true
---

Establish the current repository context from explicit conversation or repository evidence. Use the `skillset` branch only for the recognized `skillset` repository and the Province branch only when the repository is identified as a Province. Ask the Codeur which context applies when the evidence is ambiguous.

## In `skillset`

`.claude/skills` is the editorial source. `.agents/skills` is its committed Codex projection. Create, update, and delete Skill packages in `.claude/skills` before projecting them to Codex.

1. Run `npm run sync:check`. If it passes, stop.
2. List the N affected Skill packages. Compare them with the changes established in the current conversation. Treat every unexpected package as a separate decision.
3. For each affected Skill package, read the divergent material in `.claude/skills` and `.agents/skills`. Report: `#N <slug>: Claude does X; Codex does Y.` Then summarize the essence of the behavioural difference in one sentence. For a creation or deletion, name the missing side instead of inventing a comparison.
4. Ask for each package: `Do you want Codex to receive the behaviour currently defined by Claude?`
5. Do not project until the user confirms every affected Skill package.
6. Run `npm run sync:run` to project the confirmed source state. If it refuses because `.agents/skills` has direct edits, inspect `git diff -- .agents/skills` and use `npm run sync:run -- --force` only after the user confirms that replacing those edits is intended.
7. Run `npm run sync:check`. It must pass before committing.

## In a Province

1. Run `node .claude/skills/sync-skills/scripts/federal-import.mjs plan`. This reads the published `SPHERE-DI/skillset` content at `origin/main` and does not write to the Province.
2. If the published source is unavailable, identify the exact local-machine `skillset` path you could use and ask the Codeur to approve that fallback. After approval, rerun with `--local-source <path> --approve-local-source`. The plan must identify this source as `local` and `working-tree`.
3. Report the identified source and commit, then enumerate `additions`, `updates`, `removals`, and `blockingModifications`, including every file-level difference. State explicitly when a category is empty.
4. A blocking modification to a Skill fédérale requires a Codeur decision before any overwrite or removal. Finish this planning flow without writing to `.claude/skills` or `.agents/skills` in the Province.

This Province branch runs only from the manual bootstrap copy required by issue #87. It does not add `sync-skills`, whose status remains `skillset-specific`, to the imported set of Skills fédérales.

ADR-0004 defines this projection boundary.
