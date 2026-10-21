---
name: status-update
description: Post a status update to Slack — the pull requests merged and the issues resolved since a given time and date — gathered with `gh` and sent to the team's private channel with `SLACK_BOT_TOKEN`. Use when asked what has shipped or landed since some point, for a standup or end-of-day summary, or to post progress to Slack.
---

# Status update

What **landed** since a moment in time: the pull requests merged and the issues
resolved, as one message in the team's private Slack channel.

Shipped, not in flight. An open PR, a draft, a closed-unmerged PR and an issue
closed as *not planned* are **not** progress — they belong in the update only
where this skill says so, under their own heading.

## 1. Pin the moment

The user gives a time and date (`since 09:00 today`, `since Monday`,
`2026-10-20 18:00`). Turn it into one **UTC ISO-8601 timestamp** and use that
same string everywhere, so the PR list and the issue list cover the same window:

```bash
since=$(date -u -d '2026-10-20 18:00' +%Y-%m-%dT%H:%M:%SZ)   # the user's words, once
```

- A bare date means **00:00** that day, in UTC. A bare time means **today**.
- If the phrasing is ambiguous about the timezone or the day (`since Monday`
  on a Monday), say which reading you took, in one line, and go on — the window
  is cheap to re-run, and a question costs more than it saves.
- The window ends **now**. Never backdate the end to tidy the list.

## 2. Gather, with `gh`

Both searches take the same `$since`. `GITHUB_TOKEN` is already in the
environment.

```bash
gh pr list --state merged --search "merged:>=$since" --limit 100 \
   --json number,title,url,mergedAt,author,labels

gh issue list --state closed --search "closed:>=$since" --limit 100 \
   --json number,title,url,closedAt,stateReason,labels
```

Then:

- **Resolved means `stateReason: COMPLETED`.** Drop every `NOT_PLANNED` from
  the resolved list; mention them, by number and title only, under *Closed as
  not planned* when there are any. A duplicate closed as planned is still
  resolved — read the reason, not the label.
- **Fold an issue into the PR that closed it.** `gh pr view <number> --json
  closingIssuesReferences` gives the issues a merged PR closes; list that issue
  under its PR rather than twice. An issue resolved by hand, with no PR, stands
  on its own.
- **Check the boundary.** `--search` matches to the minute, so a PR merged in
  the same minute as `$since` can land either side of it. Read `mergedAt` and
  `closedAt` on the rows you keep, and drop anything strictly before `$since`.
- **100 is a cap, not a count.** A full page means the window is probably wider
  than the user meant — say the list was truncated rather than quietly cutting
  it.

Verify every link you are about to post resolves to the number beside it. A
status update with a wrong PR number is worse than a late one.

## 3. Post it

The channel is the team's private channel, **`#workshop-test-channel`**
(`C0CAS1PPM5K`) in the
[aiworkshopatjetbrains](https://aiworkshopatjetbrains.slack.com) workspace —
the same one [issue-to-pr](../issue-to-pr/SKILL.md) asks its questions in.
`SLACK_CHANNEL` in the environment overrides it; a channel named in the request
overrides both. Resolve a name to its ID before posting, and never guess one:

```bash
curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  'https://slack.com/api/conversations.list?types=private_channel,public_channel&limit=1000' \
  | jq -r '.channels[] | "\(.id)\t\(.name)"'
```

Post with `chat.postMessage`, the body from a file so no quoting mangles it:

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
post done. `not_in_channel` means the bot was never invited — say that; do not
post somewhere else instead.

### Slack's mrkdwn, not Markdown

`*bold*`, `_italic_`, `` `code` ``, `<https://url|text>` for a link. `**bold**`
and `[text](url)` render as their own punctuation. Keep it to one message:

```
*Status update* · since 2026-10-20 18:00 UTC

*Merged* (2)
• <https://github.com/o/r/pull/44|#44> Answer a malformed percent-escape with 400 — closes <…|#42>
• <https://github.com/o/r/pull/41|#41> Record a real `claude -p` run

*Resolved without a PR* (1)
• <https://github.com/o/r/issues/30|#30> …
```

One line per item: the number as a link, the title, and what it closed. No
paragraph of prose around it, and nothing that is not in the lists.

## 4. Nothing landed is an answer

An empty window still gets the message — *no pull requests merged and no issues
resolved since `<moment>`* — because silence reads as a skill that failed, not
as a quiet day. Never pad such an update with open PRs or in-progress work to
make it look fuller.

## Rules of the run

- **Post once.** Re-running the gather is free; a second message is noise. If
  the first post is wrong, say so in a reply to it rather than posting a fresh
  update — `chat.postMessage` with `thread_ts` from the first call's response.
- **Confirm the channel before the first post of a session** when it was not
  named in the request. A message is outward-facing: it cannot be unsent, and a
  team sees the wrong one.
- **Never echo `SLACK_BOT_TOKEN`** — not in a command you print, not in a log,
  not in the message. Pass it from the environment only.
- **Only report, never act.** This skill merges nothing, closes nothing and
  comments nowhere. If the gather turns up a problem — a PR merged with red
  checks, an issue closed with its spec untouched — note it in the update as a
  line, and leave it at that.
- Report the posted message's link (`permalink` from `chat.getPermalink`) and
  the counts, and nothing you did not actually do.
