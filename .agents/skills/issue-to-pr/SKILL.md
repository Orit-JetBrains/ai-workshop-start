---
name: issue-to-pr
description: Take a GitHub issue from start to merged. Read the spec, implement the issue with integration tests, open a pull request, and merge it once CI is green. Use when the user hands you an issue number or link and wants it shipped end to end.
---

# Issue to PR

Take a single GitHub issue all the way to a merged pull request: understand it,
implement it with tests, open the PR, and merge it once checks pass.

Follow the project's `AGENTS.md` throughout — it is the source of truth for
specs, tests, the definition of done, and commands. If anything here conflicts
with `AGENTS.md`, `AGENTS.md` wins.

## 1. Understand the issue

1. Read the issue: `gh issue view <number>`. Note the exact acceptance
   criteria and any linked discussion.
2. Read the spec in [spec/](../../../spec/) first. The implementation must match
   the spec; update the spec in the same change when the issue changes behavior.
3. If the issue is ambiguous or underspecified, ask the user before writing code
   rather than guessing.

## 2. Implement with tests

1. Branch off the main branch — never commit directly to it:
   `git switch -c <issue-number>-<short-slug>`.
2. In a fresh checkout, run `npm ci` once before anything else.
3. Write an **integration test for every case in the spec** that the issue
   touches. Prefer writing the failing test first, then the code that makes it
   pass.
4. Implement the issue. Keep the spec and the code in sync.
5. Run `npm test`. The definition of done is **all tests passing locally** — do
   not proceed with red tests. If they fail, fix the code (or the test if it is
   wrong) and re-run until green. Report failures honestly; never skip or
   weaken a test to make the suite pass.

## 3. Open the PR

1. Commit with a clear message and push the branch.
2. Open the PR: `gh pr create`. In the body, summarize the change and add
   `Closes #<number>` so the issue closes on merge.
3. End the PR description with:

   ```
   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```

## 4. Merge it

The definition of done requires a **green CI build**, so merge only after checks
pass:

1. Wait for CI: `gh pr checks <pr> --watch`.
2. If any check fails, read the logs, fix the branch, push, and re-run the
   tests locally. Repeat until CI is green.
3. Once all required checks pass, merge: `gh pr merge <pr> --squash --delete-branch`.
   Prefer `--auto` if the repo requires it to merge on completion of checks.
4. Confirm the PR is merged and the issue closed, and report that plainly.

Never merge on red or pending checks, and never merge a PR whose tests you had
to skip or disable to get passing.
