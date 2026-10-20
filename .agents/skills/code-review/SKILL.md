---
name: code-review
description: Review the current diff for correctness bugs. Keep it short, leave inline comments (where, how to reproduce, suggested fix), then apply each suggested fix to the working tree. Never merge a PR while any review comment is unresolved; on a clean review, mark it with a 🟢 approval and auto-merge, so an unreviewed PR is never mistaken for a clean one.
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

## Merging

Never merge — or enable auto-merge on — a pull request while any review comment
is unaddressed. Before merging, list the PR's review threads and confirm every
one is resolved: fixed by a pushed commit, or explicitly dismissed with a reply
saying why it is not a defect. Treat an open, unanswered thread as blocking,
including comments from earlier reviewers and bots, not just your own.

```bash
# Unresolved threads must be empty before any merge.
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved}}}}}' \
  -F o=<owner> -F r=<repo> -F n=<pr> --jq '[.data.repository.pullRequest.reviewThreads.nodes[]|select(.isResolved|not)]|length'
```

If the review finds nothing to fix:

- When the target is a pull request **and every review thread is resolved**,
  first **mark the review cleared** with a 🟢 approval, then enable auto-merge:

  ```bash
  gh pr review <pr> --approve --body "🟢 Code review clean — no findings."
  gh pr merge <pr> --auto --squash
  ```

  Say that you cleared it and enabled auto-merge.
- If any thread is still open, do not merge: list what is unresolved and stop.
- Otherwise (not a PR) just say the review is clean in one line and stop.

The 🟢 approval is the signal that a review actually ran and found nothing: an
absence of comments alone does **not** mean a PR was reviewed. Never merge — or
auto-merge — a PR that has no 🟢 clean marker and no resolved findings; a PR with
neither has simply not been reviewed yet. Only post the 🟢 on a genuinely empty
review — never when a finding was skipped as too risky to fix, and never while
comments remain unaddressed.
