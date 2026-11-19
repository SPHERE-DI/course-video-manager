---
name: implement
status: federal
provinces: null
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Use the `tdd` skill (invoke it via the Skill tool) where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, invoke the `code-review-pocock` skill (via the Skill tool) to review the work.

Commit your work to the current branch.
