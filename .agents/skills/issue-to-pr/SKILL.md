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
3. If the issue leaves a decision open — it is ambiguous, underspecified, or
   admits two readings that lead to different work — **ask in Slack** before
   writing the code that depends on it, rather than guessing. See
   [Asking an open decision in Slack](#asking-an-open-decision-in-slack).

## Asking an open decision in Slack

Open decisions go to the private channel **#workshop-test-channel**
(`C0CAS1PPM5K`) in the `aiworkshopatjetbrains` Slack workspace, using the bot
token in `$SLACK_BOT_TOKEN`. Ask there, wait for an answer, then carry on.

1. **Ask.** One message per decision, stating the issue number, the choice, and
   the options — someone reading only that message must be able to answer it:

   ```bash
   curl -s -X POST https://slack.com/api/chat.postMessage \
     -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
     -H "Content-type: application/json; charset=utf-8" \
     --data '{"channel":"C0CAS1PPM5K","text":"#<issue>: <the decision>. (a) <option> (b) <option> — which?"}'
   ```

   Keep the `ts` from the response: it is the thread to read the answer from.

2. **Wait — but not idly.** While waiting, do every part of the issue that does
   not depend on the answer (branch, `npm ci`, the tests and code for the
   unaffected cases). Poll the thread for the reply; replies land as thread
   messages after the original:

   ```bash
   curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
     "https://slack.com/api/conversations.replies?channel=C0CAS1PPM5K&ts=<ts>"
   ```

   Poll in the foreground (e.g. `sleep 30` between checks) and keep each run
   well inside the shell timeout. Do not background the wait and do not
   schedule a wake-up: an Air session is not resumed after the run ends, so a
   wait that outlives the turn never reports back.

3. **Go on.** Don't stall the whole issue on an unanswered question:

   - **Answered**: follow the answer. If it changes behavior, update
     [spec/](../../../spec/) in the same change, and quote the answer in the PR
     body with a link to the thread.
   - **No answer within ~10 minutes**: implement the most reasonable reading and
     keep going. Say plainly in the PR body which decision was unanswered, which
     reading was taken and why, and link the Slack thread so a reviewer can
     overrule it. Never present an assumption as a confirmed decision.

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
   tests locally. Before each push, follow
   [Adding to an existing PR](#adding-to-an-existing-pr-check-it-is-still-open). Repeat until CI is green. Never leave the PR red; never skip
   or disable a test to get there.
3. Report the PR link and the state of its checks plainly.

## Adding to an existing PR: check it is still open

Before pushing any commit meant for an existing pull request, check its state:

```bash
gh pr view <pr> --json state,headRefName -q '.state + " " + .headRefName'
```

- **`OPEN`**: push to its branch. First confirm you are on that branch
  (`git branch --show-current` equals `headRefName`): the environment can switch
  the checkout between commits, and a commit on another branch never reaches the PR.
- **`MERGED` or `CLOSED`**: **do not add code to it.** Commits pushed to a
  merged PR's branch never reach `main`, and the PR page hides them. Instead:
  1. `git fetch origin && git switch -c <short-slug> origin/<main branch>`
  2. Bring the change over: `git cherry-pick <commits>`, or make it again.
  3. Run the tests, push, and open a **new PR** with `gh pr create`. Say in its
     body that it follows up the merged `#<pr>` and why.

After pushing, confirm the commit is on the PR, not just on some branch:
`gh pr view <pr> --json commits -q '.commits[].oid'` must include `git rev-parse HEAD`.
A green check proves nothing until it ran on that commit.

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
triggers, which reviews and merges it.
