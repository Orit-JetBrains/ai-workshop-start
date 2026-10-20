---
name: code-review
description: Review the current diff for correctness bugs. Keep it short, leave inline comments (where, how to reproduce, suggested fix), then apply each suggested fix to the working tree — or auto-merge the PR when the review is clean.
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

## Apply the fixes

After the comments are written, apply each suggested fix to the working tree:

1. Edit the code to make exactly the change the comment's **Suggested fix**
   describes — no more.
2. If a fix is too risky or ambiguous to apply mechanically, leave the comment,
   skip the edit, and say why.
3. When done, show the resulting diff and run the project's tests/build so the
   changes are verified, not just written.

## When the review is clean

If the review finds nothing to fix:

- When the target is a pull request, enable auto-merge on it
  (`gh pr merge --auto --squash <pr>`) so it merges once required checks pass,
  and say that you did.
- Otherwise just say the review is clean in one line and stop.

Only auto-merge on a genuinely empty review — never when a finding was merely
skipped as too risky to fix.
