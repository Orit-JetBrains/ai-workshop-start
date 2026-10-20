---
name: demo-video
description: Record a demo video of the skill-atlas web view — the organization scan, the filter, a repository's skills, an error — by driving a real `./skill-atlas serve` in a real browser and encoding the capture to MP4 in docs/demo/. Use when asked for a video, a screencast, a GIF or a recording of a feature, or for a screenshot of the page in a real browser.
---

# Demo video

Record what the web view really does: a real `./skill-atlas serve`, a real browser, live GitHub.
A take is captured as WebM by Playwright and encoded to an MP4 in [docs/demo/](../../../docs/demo/).

The cases are **prepared in advance** in
[scripts/scenarios.mjs](scripts/scenarios.mjs) — do not write a new script per request. Pick a
case, override its inputs, and only add a scenario when the *shape* of the demo is new.

## 1. The toolchain, once per machine

```console
$ .agents/skills/demo-video/scripts/setup.sh
```

Playwright, a Chrome binary and ffmpeg, all under `/tmp/skill-atlas-demo-tools` — **nothing is
added to `package.json`**, because none of it is a dependency of skill-atlas itself. The script is
idempotent; re-run it whenever a recording fails with a missing browser or ffmpeg.

## 2. Record a case

```console
$ node .agents/skills/demo-video/scripts/record.mjs --list
$ node .agents/skills/demo-video/scripts/record.mjs organization-and-filter
recorded organization-and-filter → docs/demo/organization-and-filter.mp4
```

| Case | What it shows |
| --- | --- |
| `organization-and-filter` | Both features in one take: the organization scan, the filter over the repositories' names, a repository chosen from the list, the filter over its skills, a SKILL.md. This is the take checked in as `docs/demo/skill-atlas-demo.mp4` |
| `organization-scan` | The organization scan alone — the repositories with skills and their counts |
| `repository-and-filter` | One repository typed in directly: its skills, the filter over them, a SKILL.md |
| `unreachable-repository` | The error path: the message in the page, not a blank list |

Options:

- `--out <path>` — where the MP4 goes; default `docs/demo/<case>.mp4`
- `--set <key>=<value>` — override one of the case's inputs, repeatable:
  `--set organization=JetBrains --set repository=kotlin --set skillFilter=gradle`
- `--url <address>` — record against a server already running instead of starting one
- `--keep-webm` — keep Playwright's raw capture beside the MP4

The recorder starts `./skill-atlas serve 0` itself, on a free port, and stops it afterwards. It
takes `GITHUB_TOKEN` from the environment, or from `gh auth token` — an organization scan needs
one, and without it the scan in the video fails.

## 3. Check the take before committing it

A recording that silently captured an error page is worse than no recording. Always:

1. Read the frames, do not trust the exit code:
   `ffmpeg -ss <seconds> -i <file.mp4> -frames:v 1 /tmp/frame.png`, then open the PNG. Sample one
   frame per step of the case.
2. Check the duration and the size: `ffprobe -v error -show_entries format=duration <file.mp4>`.
   A take should be well under a minute and well under a megabyte — around 40 s and 430 KB for
   `organization-and-filter`.
3. Describe each step in [docs/demo/README.md](../../../docs/demo/README.md), and keep the counts
   in that text (`3 of 6`, `3 of 11`) matching what the video shows.

## 4. Attach it to the pull request

`AGENTS.md` asks for a demo video on a pull request whose change is visible in the web view.
Commit the MP4 under `docs/demo/` and link it in the PR body:

```markdown
[Demo](https://github.com/<owner>/<repo>/blob/<branch>/docs/demo/<file>.mp4?raw=1)
```

A file linked out of the repository this way may render as a plain link rather than as a player —
that is enough. An inline player needs the MP4 dragged into the PR body by hand, which an agent
cannot do; do not claim a video plays inline without having seen it do so.

## How it works, and what to keep that way

- **Captions, not sound.** `record.mjs` overlays a caption strip by `page.evaluate`; the served
  page is never modified for a recording. A video that needs narration explains nothing in a PR.
- **Typing is visible.** Values are typed a character at a time (`delay: 55`); a field that fills
  in one frame reads as a cut.
- **The filter hides entries with `hidden`.** A hidden `li` cannot be hovered or clicked, so
  anything chosen after a filter must be matched with `li.<role>:not([hidden])` — `choose()` in
  `record.mjs` already does.
- **Pauses are part of the demo.** Each step holds for 2–3 s so a viewer can read the list before
  it changes.
- Scenarios only drive the page and write captions. Starting the server, capturing and encoding
  stay in `record.mjs`, so a new case is a few lines.

## Pitfalls in a sandboxed workspace

- **Node's `fetch` ignores `http_proxy`.** Where GitHub is only reachable through the workspace
  proxy, every scan fails with `getaddrinfo EAI_AGAIN api.github.com` until `NODE_USE_ENV_PROXY=1`
  is set. `record.mjs` sets it for the server it starts; set it by hand when running `serve`
  yourself. This is an environment quirk — do not "fix" it in `src/`.
- **`cdn.playwright.dev` is blocked by the network policy**, so `npx playwright install chromium`
  and `npx playwright install ffmpeg` both fail with `403 Blocked by network policy`. `setup.sh`
  works around both: Chrome for Testing comes from `storage.googleapis.com`, and the system
  ffmpeg is symlinked into the `ffmpeg-<revision>` directory Playwright looks in.
- **Never `pkill -f "cli.ts serve"`.** The pattern also matches the agent's own shell, which then
  dies mid-command. Let `record.mjs` manage the server it started, or kill it by PID.
