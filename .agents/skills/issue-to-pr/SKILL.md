---
name: issue-to-pr
description: Take a GitHub issue to an open pull request with green CI. Read the spec, implement the issue with integration tests, and open a pull request for review. Use when the user hands you an issue number or link and wants it implemented and up for review.
---

# Issue to PR

Take a single GitHub issue to an **open pull request with green CI**: understand
it, implement it with tests, open the PR, and leave it open for the review
automation that follows.

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

## 5. Hand the PR off — don't poll for the review

Once CI is green, this run is over. **Do not promise to keep checking the PR**
and do not schedule wake-ups to poll it: a finished Air session is not
continued, so any "I'll check back in a few minutes" is a promise the harness
cannot keep.

The follow-up is the **code-review** automation's job
([../code-review/](../code-review/)), which this skill's `gh pr create`
triggers. That skill owns the whole rest of the path: it reviews the diff,
leaves an inline comment per finding, applies each suggested fix itself, and
merges once every thread is resolved and the checks are green. Nothing is left
here for this run to come back to.

So end the run by stating the facts and nothing more: the PR link, its check
state, and that it is now waiting on review. Report only what is already true —
never a future check you will not be awake to make.

**Do not merge, and do not close the issue by hand.** Do not run
`gh pr merge` — not with `--auto` either, which merges just the same once checks
pass. Leave the branch in place: deleting it closes the PR out from under the
review. The PR stays open for the code-review automation that its creation
triggers, and the user merges it.
