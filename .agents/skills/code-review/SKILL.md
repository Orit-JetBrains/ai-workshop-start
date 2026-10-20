---
name: code-review
description: Review the current diff for correctness bugs. Keep it short, leave inline comments (where, how to reproduce, suggested fix), then apply each suggested fix to the working tree. Never merge a PR while any review comment is unresolved; on a clean review, mark it with a 🟢 approval and merge it yourself once its checks are green, so an unreviewed PR is never mistaken for a clean one.
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

**When the target is a pull request, the working tree is not the deliverable.**
A fix that stays in a local tree is a fix nobody receives, and the PR still
carries the bug the comment describes. So finish each finding on the PR itself:

4. Check out the PR branch before editing (`gh pr checkout <pr>`), so the fixes
   land on the branch under review and not on a detached tree or on `main`.
5. Commit the applied fixes and push them to the PR branch.
6. Reply on each comment's thread saying which commit fixed it, then resolve the
   thread. A thread you skipped in step 2 gets a reply saying why, and stays
   open.

A finding is **addressed** only once its fix is pushed to the PR branch — or it
is explicitly dismissed with a reply explaining why it is not a defect. Posting
the comment is half the job; a run that left comments and pushed nothing has not
applied anything.

## Merging

A clean review ends with the pull request **merged**. Do the merge yourself in
the same run — do not hand it back to the user, and do not leave it to GitHub's
auto-merge: that is off for this repository (`allow_auto_merge: false`), so
`gh pr merge --auto` fails, and even with it on GitHub refuses to queue a PR
that is already green, which is the normal case here. Merge directly instead.

Never merge a pull request while any review comment is unaddressed. Before
merging, list the PR's review threads and confirm every one is resolved: fixed
by a pushed commit, or explicitly dismissed with a reply saying why it is not a
defect. Treat an open, unanswered thread as blocking,
including comments from earlier reviewers and bots, not just your own.

Run that check against the API, not from memory of what this run did — and
treat a non-zero count as blocking even when the run believes it fixed
everything, since an unpushed fix leaves the thread open and the PR unfixed.

If this run posted **any** inline finding, the review is by definition not
clean: do not post the 🟢, and do not merge until each of those findings is
pushed and its thread resolved. A 🟢 approval on the same run that filed a
finding is a contradiction, and merging on it ships the bug the comment
describes.

```bash
# Unresolved threads must be empty before any merge.
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved}}}}}' \
  -F o=<owner> -F r=<repo> -F n=<pr> --jq '[.data.repository.pullRequest.reviewThreads.nodes[]|select(.isResolved|not)]|length'
```

If the review finds nothing to fix:

- When the target is a pull request **and every review thread is resolved**,
  first **mark the review cleared** with a 🟢 approval, then wait for the checks
  and merge:

  ```bash
  gh pr review <pr> --approve --body "🟢 Code review clean — no findings."
  gh pr checks <pr> --watch     # green before the merge, not after
  gh pr merge <pr> --squash --delete-branch
  ```

  `gh pr checks --watch` returns as soon as the checks have finished, so a
  green build is cheap to confirm and there is no reason to skip it.
- If a check fails, do not merge: report which one, with its log, and stop.
- If any thread is still open, do not merge: list what is unresolved and stop.
- Otherwise (not a PR) just say the review is clean in one line and stop.

Then confirm the PR is merged and report it plainly — a run that reviewed a
clean PR and left it open has not finished its job.

The 🟢 approval is the signal that a review actually ran and found nothing: an
absence of comments alone does **not** mean a PR was reviewed. Never merge a PR
that has no 🟢 clean marker and no resolved findings; a PR with neither has
simply not been reviewed yet. Only post the 🟢 on a genuinely empty review —
never when a finding was skipped as too risky to fix, and never while comments
remain unaddressed.

One exception: a PR whose body asks not to be merged — a review-only replay of
already-merged code, for instance — gets the 🟢 and no merge. Say why you left
it open.
