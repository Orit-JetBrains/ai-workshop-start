---
name: code-review
description: Review the current diff for correctness bugs. Keep it short, leave inline comments, and for each one say where it is, how to reproduce it, and a suggested fix.
---

# Code review

Review the pending changes (the current diff unless a target is given) for real
correctness bugs. Favor a few high-confidence findings over a long list.

## How to review

1. Get the diff for the target (current working tree by default).
2. Read each changed hunk and the surrounding code it affects.
3. Report only defects you can justify — bugs, broken edge cases, regressions.
   Skip style and speculative nits.

## Output

Keep the review short. Do not summarize the whole diff.

Leave one **inline comment per finding**, anchored to the specific
`file:line`. Each comment must contain:

- **Where** — the exact `file:line` (and symbol) the finding is about.
- **What** — one sentence stating the bug.
- **How to reproduce** — concrete inputs or steps that trigger it, and the
  wrong result they produce.
- **Suggested fix** — the concrete change that resolves it. Prefer a short code
  snippet or a GitHub suggestion block; otherwise one specific sentence. Don't
  just restate the problem — say what to do.

If nothing is wrong, say so in one line and stop.
