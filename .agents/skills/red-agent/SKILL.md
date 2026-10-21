---
name: red-agent
description: Break the skill-atlas web view on purpose, then file what broke — one GitHub issue per bug, with reproduction steps and a video of the bug happening, labelled "Delegated to AI" so the issue-to-pr automation picks it up. Use when asked to hunt for bugs, to try to break the web view, to QA or adversarially test the page, or to turn findings into issues.
---

# Red agent

Attack the web view until it misbehaves, then hand each bug over as an issue
somebody — or the `issue-to-pr` automation — can pick up and fix.

**Find and file; never fix.** This skill ends at filed issues. The fix is
[issue-to-pr](../issue-to-pr/SKILL.md)'s job, which is exactly why every issue
carries the **`Delegated to AI`** label. An issue you fixed yourself is a bug
nobody else ever saw.

[spec/web.md](../../../spec/web.md) is the oracle: a bug is the **page
disagreeing with the spec**, not the page disagreeing with your taste. Read it
before you start, together with [spec/analysis.md](../../../spec/analysis.md)
for the grouping rules the page draws. If the spec is silent on what you found,
say so in the issue instead of asserting a bug.

## 1. Two servers to attack

| Server | Command | Use it for |
| --- | --- | --- |
| Replayed | `node tests/demo/server.ts` → `127.0.0.1:4322` | Everything about the page itself: the list, the groups, the filter, the counts. No token, no network, and the same answers every run — a bug found here reproduces for the person who fixes it |
| Live | `NODE_USE_ENV_PROXY=1 ./skill-atlas serve 0` | The paths the recording cannot answer: a real organization scan, a token-less scan, a repository that moved, a local directory |

Run `npm ci` first in a fresh checkout. Prefer the replayed server: a report
whose steps only reproduce on the network is a report that gets closed.

## 2. Where it breaks — probe these

Work down the list, in the page *and* against the API with `curl`; the spec
holds both to the same answers, and a divergence between them is itself a bug.

- **The filter against the groups.** A query that empties a group must hide its
  word and count too — never a word with nothing under it. A query matching
  only a *description*. A query matching a **date** (`2026`, `updated`), which
  must match nothing. Emptying the filter must restore the whole list; a scan
  must empty the filter.
- **The counts.** `<matched> of <all>` after a filter, after a scan, after a
  second scan, before any list exists. `N repositories, M with skills`. A
  repository whose skills make one group must show **no word at all**.
- **The chosen skill.** The scan chooses the list's first skill — the first
  group's first, not the file system's first. What is chosen after the filter
  hides it? After a scan that returns no skills? Copies (`also in <paths>`).
- **The address.** `?repo=<input>` on load, with a value that errors, with an
  empty value, with one repeated (`?repo=a&repo=b`), with the input
  percent-encoded or carrying a query of its own.
- **The errors.** An unreachable repository, a 404, an organization with no
  token, a local path that is not a directory. Each must put **its message in
  the page** — not a blank list, not a stale list from the scan before it.
- **The API.** `GET /api/scan` with no `repo` → 400. An error → 400 and
  `{"error": …}`, never a 200 with an empty list. Any other path → 404. A
  **malformed request target** (`curl --path-as-is ... "http://127.0.0.1:4322/%"`)
  → 400, **and the server keeps serving** — check with a second request after
  it, because a crash here is the kind of bug the page never shows you.
- **The top bar.** Field, *Scan* and filter are always there, before a scan
  too, and stay on screen while the list scrolls.

Two scans racing, an empty input, whitespace, a URL with a trailing slash or
`.git`, and a very long input are all fair game. So is the back button.

**What is not a bug:** the workspace's own quirks — `EAI_AGAIN api.github.com`
without `NODE_USE_ENV_PROXY=1`, `cdn.playwright.dev` blocked by the network
policy, a missing `GITHUB_TOKEN` on an organization scan (the spec *requires*
one). Rate limits are not bugs either. Do not file them, and do not "fix" them
in `src/`.

## 3. Confirm each bug before you write it up

1. **Reproduce it twice**, from a fresh server, following your own steps
   literally. A finding you cannot repeat is a finding you misread.
2. **Quote the spec line it violates**, and say what the page does instead.
3. **Reduce it**: the shortest input and the fewest steps that still break it.
4. **Separate the bugs.** One issue per bug. Two symptoms of one cause are one
   issue; two causes in one issue is an issue that gets half-fixed.

## 4. Record the bug happening

Every issue gets a video of the bug, recorded with the
[demo-video](../demo-video/SKILL.md) skill — read it, and run its `setup.sh`
once per machine.

A bug repro is a **new shape** of demo, so it earns a scenario: add
`bug-<slug>` to
[scripts/scenarios.mjs](../demo-video/scripts/scenarios.mjs), driving the
exact steps from §3, with a caption per step that names the expected result and
the wrong one. Record it against the server you reproduced on:

```console
$ node .agents/skills/demo-video/scripts/record.mjs bug-<slug> \
    --url http://127.0.0.1:4322 --out docs/demo/bug-<slug>.mp4
```

Then check the take as that skill's §3 demands — sample frames with `ffmpeg`,
confirm the **wrong result is visible in a frame**, and keep it well under a
minute. A video that shows a working page is worse than none: it argues the bug
away.

Clips and scenarios do **not** go on `main`. Put them on one branch for the
run and push it, so each issue can link a raw file:

```bash
git switch -c red-agent/$(date +%Y-%m-%d)-findings
git add docs/demo/bug-*.mp4 .agents/skills/demo-video/scripts/scenarios.mjs
git commit -m "red-agent: reproductions for the bugs filed in this run"
git push -u origin HEAD
```

Link it from the issue as
`https://github.com/<owner>/<repo>/blob/<branch>/docs/demo/bug-<slug>.mp4?raw=1`.
GitHub renders a linked file like that as a plain link, not a player — that is
enough; an inline player needs a hand-dragged upload, which an agent cannot do.
Never claim a video plays inline without having watched it do so.

## 5. File one issue per bug

First, **do not file a duplicate**: `gh issue list --state all --search "<the
symptom>"`, and read the near misses before adding yours.

```bash
gh issue create --label "Delegated to AI" --title "Web view: <symptom, in one line>" --body-file /tmp/bug-<slug>.md
```

The body, in this order:

- **What happens** — one sentence, the wrong result.
- **Steps to reproduce** — numbered, starting from the server command, with the
  exact inputs. Anyone must be able to paste them.
- **Expected** — quote the line of `spec/web.md` (or `spec/analysis.md`) it
  breaks, with the file and the heading.
- **Actual** — what the page or the API returned, pasted verbatim.
- **Video** — the raw link from §4, with a word on what the frames show.
- **Scope** — replayed server, live, or both; and the commit you found it on
  (`git rev-parse --short HEAD`).

Keep `Delegated to AI` on every one of them — that label is the hand-off. Add
`bug` as well, and `accessibility` when the finding is a barrier rather than a
wrong answer. Do not assign, do not open a PR, do not touch the code under
`src/`.

## 6. Report the run

End with the facts and nothing more: what you attacked, the issues you filed
with their links, the branch holding the videos, and — just as useful — the
probes from §2 that the page **survived**. A red-agent run that found nothing is
a result; say so plainly rather than filing something weak to have filed
something.
