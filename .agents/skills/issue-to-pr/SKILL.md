---
name: issue-to-pr
description: Take a GitHub issue to an open pull request with green CI. Read the spec, implement the issue with integration tests, and open a pull request for review. Use when the user hands you an issue number or link and wants it implemented and up for review.
---

# Issue to PR

Take a single GitHub issue to an **open pull request with green CI**: understand
it, implement it with tests, open the PR, leave it open, and keep checking back
on it every few minutes until it is merged or closed.

**Never merge.** This skill ends at the open PR. Opening it triggers a separate
code-review automation, and the review and the merge are that automation's and
the user's to make — a PR this skill merged itself is a PR nobody could review.

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

## 4. Get CI green

The definition of done requires a **green CI build**, so the PR is not ready
until checks pass:

1. Wait for CI: `gh pr checks <pr> --watch`.
2. If any check fails, read the logs, fix the branch, push, and re-run the
   tests locally. Repeat until CI is green. Never leave the PR red; never skip
   or disable a test to get there.
3. Report the PR link and the state of its checks plainly.

## 5. Watch the PR every few minutes

Once the PR is open, keep checking back on it every few minutes rather than
walking away — the code-review automation posts asynchronously and CI can go
red on a later run.

1. Each round, read the current state:
   `gh pr view <pr> --json state,mergeStateStatus,reviewDecision` and
   `gh pr checks <pr>`, plus
   `gh pr view <pr> --comments` for review feedback.
2. Act on what you find:
   - **Review comments** — address them: fix the code, run `npm test`, push.
     Reply on the thread saying what changed. Push back politely with reasoning
     if a comment is wrong, rather than making a change you believe is wrong.
   - **A red check** — treat it exactly as in step 4: read the logs, fix, push.
   - **Nothing new** — say so briefly and check again later.
3. Between rounds, wait a few minutes — don't busy-poll. Use `ScheduleWakeup`
   with a `delaySeconds` of 120–270 while actively waiting on CI or a review,
   and stretch to 1200+ once the PR has been quiet for a while.
4. Stop watching when the PR is merged or closed, or when the user says to
   stop. Report the final state.

**Still never merge** — watching the PR does not become permission to close it
out. Reviews and the merge stay the automation's and the user's.

**Do not merge, and do not close the issue by hand.** Do not run
`gh pr merge` — not with `--auto` either, which merges just the same once checks
pass. Leave the branch in place: deleting it closes the PR out from under the
review. The PR stays open for the code-review automation that its creation
triggers, and the user merges it.
