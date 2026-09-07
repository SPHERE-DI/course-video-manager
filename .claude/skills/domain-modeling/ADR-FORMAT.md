# ADR Format

ADRs live in `docs/adr/` as flat files with sequential numbering: `0001-slug.md`, `0002-slug.md`, etc.

## Template

The Template of an ADR is `docs/adr/0000-ADR-TEMPLATE.md`.
If the repo has no template yet, copy the canonical one (`docs/adr/0000-ADR-TEMPLATE.md` from github `SPHERE-DI/skillset`) as `docs/adr/0000-ADR-TEMPLATE.md` first, then proceed. Create `docs/adr/` lazily — only when the first ADR is needed.

## Invariants

- **One ADR = one decision.** If you are describing two, split into two ADRs.
- **The core is 1–3 sentences**: the context (the forces at play), the decision, and why. An ADR can be just that paragraph. The value is in recording *that* a decision was made and *why* — not in filling out sections.
- **Optional sections** and **Frontmatter** — see TEMPLATE
- **A human decides** An agent may draft an ADR, but only in a HITL session
- **Immutable once accepted** Don't rewrite the body. Amend by *adding* a dated section (`## Mise à jour — {YYYY-MM-DD}`), or supersede with a new ADR and flip the old `status`.
- **Sources** Pocock, Nygard, MADR, JPH

## Numbering

Scan `docs/adr/` for the highest existing number and increment by one. `0000` is reserved for the template.

## When to offer an ADR

All three of these must be true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will look at the code and wonder "why on earth did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If a decision is easy to reverse, skip it — you'll just reverse it. If it's not surprising, nobody will wonder why. If there was no real alternative, there's nothing to record beyond "we did the obvious thing."

### What qualifies

- **Architectural shape.** "We're using a monorepo." "The write model is event-sourced, the read model is projected into Postgres."
- **Integration patterns between contexts.** "Ordering and Billing communicate via domain events, not synchronous HTTP."
- **Technology choices that carry lock-in.** Database, message bus, auth provider, deployment target. Not every library — just the ones that would take a quarter to swap out.
- **Boundary and scope decisions.** "Customer data is owned by the Customer context; other contexts reference it by ID only." The explicit no-s are as valuable as the yes-s.
- **Deliberate deviations from the obvious path.** "We're using manual SQL instead of an ORM because X." Anything where a reasonable reader would assume the opposite. These stop the next engineer from "fixing" something that was deliberate.
- **Constraints not visible in the code.** "We can't use AWS because of compliance requirements." "Response times must be under 200ms because of the partner API contract."
- **Rejected alternatives when the rejection is non-obvious.** If you considered GraphQL and picked REST for subtle reasons, record it — otherwise someone will suggest GraphQL again in six months.
