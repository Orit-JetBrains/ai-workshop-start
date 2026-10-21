---
name: code-review
description: Review the current diff for correctness bugs. Keep it short, leave inline comments (where, how to reproduce, suggested fix), then apply each suggested fix to the working tree. Never merge a PR while any review comment is unresolved; on a clean review, mark it with a 🟢 approval and merge it yourself once its checks are green, so an unreviewed PR is never mistaken for a clean one. A PR that conflicts with its base gets rebased, tested and pushed in the same run — a conflict is work, not a finding. Only an explicit do-not-merge marker holds a clean PR back, never prose in its body — and a run that stops without merging tells a person in Slack, because nobody is watching the PR page.
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
4. Before pushing the fixes to the PR, follow
   [Adding to an existing PR](#adding-to-an-existing-pr-check-it-is-still-open):
   a PR merged in the meantime gets its fixes in a new PR, not more commits.

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

**When the target is a pull request, the working tree is not the deliverable.**
A fix that stays in a local tree is a fix nobody receives, and the PR still
carries the bug the comment describes. So finish each finding on the PR itself:

4. Before steps 1–3, check out the PR branch (`gh pr checkout <pr>`) so the
   edits land on the branch under review and not on a detached tree or on
   `main`.
5. Commit the applied fixes and push them to the PR branch.
6. Reply on each comment's thread saying which commit fixed it, then resolve the
   thread. A thread you skipped in step 2 gets a reply saying why, and stays
   open.

A finding is **addressed** only once its fix is pushed to the PR branch — or it
is explicitly dismissed with a reply explaining why it is not a defect. Posting
the comment is half the job; a run that left comments and pushed nothing has not
applied anything.

## A PR that conflicts with its base: resolve it, don't report it

A pull request whose branch has drifted from its base cannot be merged, however
clean the review. That is **work the PR needs, not a finding** — nobody wants a
comment saying *"this conflicts"* — so do it in the same run, exactly as the
suggested fixes are done.

Check the state before reviewing and again before merging:

```bash
gh pr view <pr> --json mergeable,mergeStateStatus -q '.mergeable + " " + .mergeStateStatus'
```

- `CONFLICTING` / `DIRTY` — resolve it, below.
- `UNKNOWN` — GitHub is still computing the merge; wait a few seconds and ask
  again. Never read it as clean.
- `MERGEABLE` / `CLEAN`, `UNSTABLE` (checks still running) — nothing to resolve.

To resolve:

```bash
gh pr checkout <pr>
git fetch origin
before=$(git rev-parse HEAD)          # for --force-with-lease, below
git rebase origin/<main branch>       # the PR's base, not always `main`
```

Rebase rather than merge: this repository squash-merges, so a merge commit in
the branch only muddles the review's diff.

Then, hunk by hunk:

1. **Keep both intents.** Almost every conflict here is two commits editing
   neighbouring lines of one file — a helper added above a function whose
   signature the PR changed, a new test beside a changed one. Both sides are
   wanted; a resolution that drops either silently reverts someone's merged work.
2. **Stop at a real disagreement.** When the two changes contradict each other —
   both rewrite the same rule in `spec/`, both change one function's contract,
   both answer the same request differently — that is a semantic conflict, and
   picking a side is a behavior decision, not a merge. Abort
   (`git rebase --abort`), leave the PR alone, and
   [tell a person](#stopping-needs-a-person) which two changes disagree.
3. **Never hand-merge a binary.** Screenshots, recorded videos and other
   generated files have no hunks to reconcile: take the base's copy and
   regenerate the PR's the way the project documents (for this repository, the
   `accept screenshots` label re-renders the demo images on CI). Choosing a side
   byte-wise produces a file that matches neither change.
4. **Run the whole suite afterwards.** A rebase that compiles is not a rebase
   that works: the conflict is only resolved once `npm test` — the project's own
   command from `AGENTS.md` — passes on the rebased branch. Fix what the rebase
   broke before pushing; a red branch is not a resolved conflict.

Push with a lease, never a bare force, so a commit the author or an earlier
review pushed in the meantime is not silently dropped:

```bash
git push --force-with-lease="$(git branch --show-current):$before" origin HEAD
```

A rebase **rewrites every commit hash on the branch**. So:

- a review thread that says *"fixed in `<sha>`"* now names a commit that is not
  on the branch — when resolving such a thread, reply with the **new** hash and
  say the branch was rebased, or the trail leads nowhere;
- the checks that were green ran on the old head: wait for the new ones
  (`gh pr checks <pr> --watch`) before merging. A green tick on a replaced commit
  proves nothing;
- re-read `mergeable` afterwards and confirm it is `MERGEABLE`.

Then report the resolution plainly in the review: which commits the branch was
rebased onto, which files conflicted, and that the suite passes — a reviewer
after you should not have to work out why the hashes moved.

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
- If the PR conflicts with its base, do not merge and do not stop either:
  [resolve the conflict](#a-pr-that-conflicts-with-its-base-resolve-it-dont-report-it),
  push, wait for the new checks, and then merge in the same run.
- Otherwise (not a PR) just say the review is clean in one line and stop.

Then confirm the PR is merged and report it plainly — a run that reviewed a
clean PR and left it open has not finished its job.

The 🟢 approval is the signal that a review actually ran and found nothing: an
absence of comments alone does **not** mean a PR was reviewed. Never merge a PR
that has no 🟢 clean marker and no resolved findings; a PR with neither has
simply not been reviewed yet. Only post the 🟢 on a genuinely empty review —
never when a finding was skipped as too risky to fix, and never while comments
remain unaddressed.

### The one exception: an explicit do-not-merge marker

A PR can ask not to be merged — a review-only replay of already-merged code, for
instance. It gets the 🟢 and no merge, with a line saying why it was left open.

That opt-out is **a marker, never prose**. Honor exactly two:

- a line in the PR body starting `Do-not-merge:`, followed by what has to happen
  first;
- a `do not merge` label on the PR.

```bash
# Both, in one go: a marker line in the body, or the label.
gh pr view <pr> --json body,labels \
  --jq '[(.body | split("\n")[] | select(startswith("Do-not-merge:"))), (.labels[].name | select(. == "do not merge"))]'
```

**Everything else in the body is prose, and prose is not a gate.** An author
writing *"worth one real run before merging"*, *"needs a look from someone who
knows this code"*, or *"what X does in production is untested"* is telling a
reviewer what to weigh — which is what a PR body is for. Reading that as an
instruction not to merge turns honesty in a description into an indefinite
block: nothing in the sentence says when it stops applying, so it never does,
and a green, approved, thread-free PR sits open for no recorded reason. A
reviewer who merges a clean PR over such a sentence is not overriding the
author; a reviewer who stalls on one has invented a gate the author never set.

If a sentence like that worries you, the answer is in the review, not the stall:
say so in the 🟢 — *"merged; the live path is covered by tests against a
stand-in only"* — and merge. If it is a real defect, it is a finding, with a
comment and a fix. If you are genuinely unsure whether the author meant a gate,
[ask them](#stopping-needs-a-person) rather than deciding by silence.

A marker, finally, is only as good as its end: when the thing it names is done,
**the marker goes** — the author removes the line or the label, and the next
review merges. A `Do-not-merge:` that outlived its reason is the same stall by
another name, so a review that finds one it believes is satisfied says so on the
PR and asks for it to be cleared.

## Stopping needs a person

This skill stops without merging in five places: a **failing check**, an
**unresolved thread** it would not fix, a **do-not-merge marker**, a **conflict
it must not resolve itself** (two changes that disagree, per
[the section above](#a-pr-that-conflicts-with-its-base-resolve-it-dont-report-it)),
and a target that is **not a PR**. In the first four, a human has to act next —
and nobody is watching the PR page. The run that opened the PR is over
([issue-to-pr](../issue-to-pr/SKILL.md) §5 forbids it from polling), and this run
ends here, so a comment on the PR is addressed to no one: that is how a green,
approved pull request sits open for hours.

So before ending such a run, **tell a person**, in the place
[issue-to-pr](../issue-to-pr/SKILL.md#an-open-decision-ask-wait-go-on) already
names: the private Slack channel **`#workshop-test-channel`** in the
[aiworkshopatjetbrains](https://aiworkshopatjetbrains.slack.com) workspace, with
the run's Slack tool, as one message that

- links the PR;
- says which of the five states it stopped in, in one line;
- says the **one action** that unblocks it — *"do a real `claude -p` run, then
  merge"*, *"decide whether thread #3 is a defect"*, *"clear the `Do-not-merge:`
  line, it is satisfied"*, *"decide which of these two changes wins"*;
- links the check's log, or the thread, when that is what stopped it.

**No Slack tool in this run?** Do not quietly tell no one. Comment on the PR
(`gh pr comment <pr>`), mention its author, and say in the comment that Slack was
not reachable from the run.

Then end the run. **Do not wait for the answer**: unlike the one wait
`issue-to-pr` makes before writing code, there is nothing here to go on with — the
review is done and reported. A finished Air session is not continued, so never
promise to come back and merge.
