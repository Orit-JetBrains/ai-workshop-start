---
name: status-update
description: Post a status update to Slack, saying what the project is, which pull requests merged and which issues resolved since a given time and date, and what is still in flight. Gathered with `gh` and sent to the team's private channel with `SLACK_BOT_TOKEN`. Use when asked what has shipped or landed since some point, for a standup or end-of-day summary, or to post progress to Slack.
---

# Status update

Where the project stands, as one message in the team's private Slack channel:
what it is, what **landed** since a moment in time, and what is **in flight**
right now.

The reader may not have the repository open. Three things make the difference
between a report and a list of numbers, and none of them is optional:

1. **What the project does**, in a line or two, before any list.
2. **A marker on every line** saying what its number is: `PR`, `issue`, `bug`.
3. **Work in progress**, not only what merged. An open PR is where the project
   is, and leaving it out makes a busy day look empty.

No em dashes anywhere in the message or in this document. A comma, a colon,
parentheses or a new sentence says the same thing.

## 1. Pin the moment

The user gives a time and date (`since 09:00 today`, `since Monday`,
`2026-10-20 18:00`). Turn it into one **UTC ISO-8601 timestamp** and use that
same string everywhere, so the merged list and the resolved list cover the same
window:

```bash
since=$(date -u -d '2026-10-20 18:00' +%Y-%m-%dT%H:%M:%SZ)   # the user's words, once
```

- A bare date means **00:00** that day, in UTC. A bare time means **today**.
- If the phrasing is ambiguous about the timezone or the day (`since Monday` on
  a Monday), say which reading you took, in one line, and go on. The window is
  cheap to re-run, and a question costs more than it saves.
- The window ends **now**. Never backdate the end to tidy the list.
- **The window bounds what landed, not what is in flight.** In-progress work is
  the project's state today, so §4 lists every open PR and issue regardless of
  when it was opened. Say so in the message, so nobody reads an old open PR as
  having been opened in the window.

## 2. Say what the project is

One or two sentences at the top of the message, before the lists: what the
project is for, and who or what it is used by. Read it off the repository
rather than inventing it:

```bash
gh repo view --json description,name -q '.name + ": " + .description'
head -20 README.md
ls spec/            # what the project's own spec says it has
```

Keep it the same from one update to the next, so a regular reader can skip it
and a new one does not have to ask. It is a description of the project, never a
summary of the window below it.

## 3. Gather what landed

Both searches take the same `$since`. `GITHUB_TOKEN` is already in the
environment.

```bash
gh pr list --state merged --search "merged:>=$since" --limit 100 \
   --json number,title,url,mergedAt,author,labels

gh issue list --state closed --search "closed:>=$since" --limit 100 \
   --json number,title,url,closedAt,stateReason,labels
```

Then:

- **Resolved means `stateReason: COMPLETED`.** Drop every `NOT_PLANNED` from the
  resolved list, and mention those by number and title only, under *Closed as
  not planned*, when there are any. A duplicate closed as planned is still
  resolved: read the reason, not the label.
- **Link each PR to its issue, and do not trust one field for it.**
  `gh pr view <number> --json closingIssuesReferences` is the first try, but it
  comes back **empty even for a PR whose body says `Closes #39`**, so when it is
  empty, look further before writing *no linked issue*:

  ```bash
  gh pr view <n> --json body -q .body | grep -oiE '(closes|fixes|resolves) #[0-9]+'
  gh pr view <n> --json headRefName -q .headRefName   # issue-to-pr names branches <number>-<slug>
  gh api repos/<owner>/<repo>/issues/<issue>/timeline \
    --jq '.[] | select(.event=="closed") | .commit_id'   # the merge commit that closed it
  ```

  The last one is what actually closed the issue, and `git log --oneline -1
  <commit>` names the PR. Say *no linked issue* only once all three come up
  empty.
- **Mark what each item is.** Every line opens with its kind, so a reader never
  has to guess whether a number is a PR or an issue: **`PR`**, **`issue`**, or
  **`bug`** for an issue carrying the `bug` label (read `labels`, which every
  query here already asks for). A PR's line names the issue it belongs to, with
  that issue's own marker and title. An issue's line names the PR that closed
  it.
- **An issue appears under both headings**, as the PR's subject *and* on its own
  line under *Resolved issues*. The cross-reference is the point: a reader
  scanning for "what got fixed" should not have to read the PR list to find it.
  An issue resolved by hand, with no PR at all, says so on its line.
- **Check the boundary.** `--search` matches to the minute, so a PR merged in
  the same minute as `$since` can land either side of it. Read `mergedAt` and
  `closedAt` on the rows you keep, and drop anything strictly before `$since`.
- **100 is a cap, not a count.** A full page means the window is probably wider
  than the user meant, so say the list was truncated rather than quietly cutting
  it.

Verify every link you are about to post resolves to the number beside it. A
status update with a wrong PR number is worse than a late one.

## 4. Gather what is in flight

Not bounded by `$since`: this is the project's state now.

```bash
gh pr list --state open --limit 100 \
   --json number,title,url,isDraft,labels,headRefName,updatedAt,statusCheckRollup

gh issue list --state open --limit 100 \
   --json number,title,url,labels,updatedAt,assignees
```

- **An open PR carries its issue**, found the same way as in §3, so a reader
  sees that `PR #46` is the fix for `bug #43` rather than two loose numbers.
- **Say what is holding it**, in a few words from the data you already have:
  `draft`, `checks failing` or `checks pending` from `statusCheckRollup`,
  `in review` otherwise. Never guess at a reason the data does not show.
- **An open issue with no open PR is not started.** List it under the same
  heading, marked, with `queued for the AI automation` when it carries
  `Delegated to AI`. That label is what
  [issue-to-pr](../issue-to-pr/SKILL.md) picks up, so it is the closest thing to
  a queue this project has.
- Leave out the PR that **is** this status update, if a run of this skill opened
  one. It is noise to the reader.

## 5. Post it

The channel is the team's private channel, **`#workshop-test-channel`**
(`C0CAS1PPM5K`) in the
[aiworkshopatjetbrains](https://aiworkshopatjetbrains.slack.com) workspace, the
same one [issue-to-pr](../issue-to-pr/SKILL.md) asks its questions in.
`SLACK_CHANNEL` in the environment overrides it, and a channel named in the
request overrides both. Resolve a name to its ID before posting, and never
guess one:

```bash
curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  'https://slack.com/api/conversations.list?types=private_channel,public_channel&limit=1000' \
  | jq -r '.channels[] | "\(.id)\t\(.name)"'
```

Post with `chat.postMessage`, the body from a file so no quoting mangles it.
`jq` is not installed everywhere; `python3 -c 'import json, sys; ...'` builds
the same payload:

```bash
jq -n --arg channel "$channel" --arg text "$(cat /tmp/status-update.md)" \
   '{channel: $channel, text: $text, unfurl_links: false}' > /tmp/status.json

curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data @/tmp/status.json
```

**`"ok": true` is the only success.** The call returns HTTP 200 with
`{"ok": false, "error": "channel_not_found"}` or `"not_in_channel"` just the
same, so read the body, report the `error` verbatim, and never call a failed
post done. `not_in_channel` means the bot was never invited: say that, and do
not post somewhere else instead.

### Slack's mrkdwn, not Markdown

`*bold*`, `_italic_`, `` `code` ``, `<https://url|text>` for a link. `**bold**`
and `[text](url)` render as their own punctuation. One message, in this order:

```
*Status update* · skill-atlas · landed since 2026-10-20 18:00 UTC

*The project*: Skill Atlas lists every SKILL.md in a repository, in the terminal and
in a local web view: a CLI and a page that scan a GitHub repository, a whole
organization or a local directory, and show each skill with its description, its
last updated date and a link, grouped by the words the skills share.

*Merged PRs* (2)
• *PR* <…/pull/44|#44> Answer a malformed percent-escape with 400, fixes *bug* <…/issues/42|#42> _a malformed request target is answered 404_
• *PR* <…/pull/41|#41> Record a real `claude -p` run (no linked issue)

*Resolved issues* (2)
• *bug* <…/issues/42|#42> A malformed request target is answered 404, fixed by *PR* <…/pull/44|#44>
• *issue* <…/issues/30|#30> Show each skill's last updated date, closed by hand, no PR

*In progress* (2, current state, not limited to the window)
• *PR* <…/pull/46|#46> The back button returns to the previous scan, for *bug* <…/issues/43|#43>, in review
• *bug* <…/issues/50|#50> The filter keeps a group's word with nothing under it, no PR yet, queued for the AI automation

None closed as not planned.
```

One line per item, in this order: the **marker**, the number as a link, the
title, then the relation (`fixes …`, `closed by …`, `no linked issue`) and, for
in-flight work, what is holding it. The other side's title goes in `_italics_`
so two numbers on a line stay told apart. No paragraph of prose around the
lists, and nothing in them that the gather did not find.

## 6. A quiet window is still an answer

No merges and no resolutions still gets the message: say *no pull requests
merged and no issues resolved since `<moment>`*, then the **In progress** list,
which is the useful part of a quiet day. Silence reads as a skill that failed.
Never pad the *Merged* list with open work to make it look fuller; in-progress
work belongs under its own heading, where the reader can tell the two apart.

## Rules of the run

- **Post once.** Re-running the gather is free, a second message is noise. If
  the first post is wrong, correct it in a reply to it rather than posting a
  fresh update: `chat.postMessage` with `thread_ts` from the first call's
  response, and `reply_broadcast: true` when the channel should see the
  correction too.
- **Confirm the channel before the first post of a session** when it was not
  named in the request. A message is outward-facing: it cannot be unsent, and a
  team sees the wrong one.
- **Never echo `SLACK_BOT_TOKEN`**, not in a command you print, not in a log,
  not in the message. Pass it from the environment only.
- **Only report, never act.** This skill merges nothing, closes nothing and
  comments nowhere. If the gather turns up a problem, a PR merged with red
  checks or an issue closed with its spec untouched, note it in the update as a
  line and leave it at that.
- Report the posted message's link (`permalink` from `chat.getPermalink`) and
  the counts, and nothing you did not actually do.
