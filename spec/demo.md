# The demo, as tests
`npm run test:demo` (`playwright test`): the five steps of [docs/demo/](../docs/demo/)'s video, run in a browser
against a real `skill-atlas serve`, and **recorded**. `npm test` runs them after the Node tests.
## Deterministic
Nothing in a run may depend on the machine, the network or the day:
- **Data**: `tests/demo/github.json`, a recording of the scan the demo ran live, replayed by
  `src/core/replay.ts`. It answers nothing it has not recorded, so a test that leaves the demo's data
  **fails** instead of reaching GitHub. `npm run test:demo:record` rewrites it — a token, and the
  numbers in `tests/demo/demo.spec.ts` move with it
- **Server**: `tests/demo/server.ts`, the project's own `serve`, on `127.0.0.1:4322` (`DEMO_PORT`),
  started and stopped by Playwright. Each scan reads the recording again: *nothing is stored*
- **Viewport**: **1280×760**, as the video was recorded, at a device pixel ratio of **1**
- **Fonts**: `tests/demo/fonts` — Inter 400/600 and JetBrains Mono 400 — served to the page by
  Playwright and forced onto every element, so a machine with no fonts at all renders the same text
- **Browser**: Chromium, one worker, no retries, light colour scheme, `en-US`, UTC, reduced motion,
  hinting and subpixel positioning off, scrollbars hidden. `CHROME_PATH` points at a browser elsewhere
- The same two runs produce the **same screenshots**, byte for byte
## Recorded
Every run, whether it passes or fails: a **video**, a **trace** and a final **screenshot** of each test, in
`test-results/<run>/`, with the HTML report in `playwright-report/<run>/`. `<run>` is `DEMO_RUN_ID`, or
the time the run started: a run never overwrites the one before it. CI sets it to the workflow run
and keeps the directory as an artifact for 30 days.
## The steps
Each is one test, and all five again as one, end to end — the video's order:
1. **The organization scan.** `github.com/modelcontextprotocol` → `modelcontextprotocol · 45 repositories,
   6 with skills`, and the six with their counts: conformance 3, csharp-sdk 7, inspector 11,
   kotlin-sdk 2, python-sdk 1, servers 11
2. **The filter, on an organization's list.** `sdk` → `3 of 6`, the three SDK repositories; emptying it → `6 of 6`
3. **A repository chosen from the organization.** `inspector` → its URL in the field, its **11 skills** in the
   list, each with its name, description and link; the filter emptied
4. **The filter, on the skills.** `issue` → `3 of 11`: issue-create, issue-triage, and pr-flow on its description
5. **A skill chosen** → its SKILL.md, the whole file, front matter included; the first skill is chosen by the scan
Two screens the video does not show, because nothing happens in them, are screenshotted too:
**before a scan** — the top bar, an empty list, no count — and an **unreachable repository**,
`github.com/modelcontextprotocol/does-not-exist`, whose 404 is recorded like any other answer:
`Repository not found: <url>` in the page, and still nothing to count
Three more hold the run itself to the spec: the viewport and the fonts are the demo's, a reload
starts from an empty page, and **one changed pixel fails the comparison** — a single pixel painted
over step 1's screen must fail step 1's image, so a tolerance can never creep in unnoticed.
## Screenshots
Each of the five steps ends with its screen **compared** with a checked-in image, `tests/demo/screenshots/<step>.png`:
`1-organization`, `2-organization-filtered`, `3-repository`, `4-skills-filtered`, `5-skill`, and the two
screens above: `before-a-scan`, `an-error`
- **One changed pixel is a failure**: no tolerance, neither in a pixel's colour nor in how many differ.
  Playwright allows a fifth of a colour by default, which is a tolerance for a page whose rendering is
  not pinned; everything about this one is
- The images are **CI's**: Linux, and the Chromium the workflow installs. They are identical for a given
  browser build, not across them, so **only CI compares**; elsewhere the comparison is skipped
- On CI, a screen that differs from its image, or a step with no image, **fails** the run. Its artifact holds
  the *expected*, *actual* and *diff* images, and the HTML report shows them side by side
- **Accepting** a change: label the pull request `accept screenshots`. The *Accept screenshots* workflow renders
  the screens again on CI, commits the ones that changed, or had no image, to the pull request's branch, and takes
  the label off. A step that fails for any other reason commits nothing
- CI on that commit: with an `ACCEPT_SCREENSHOTS_TOKEN` secret it starts as on any push; without one, GitHub holds
  it until it is approved on the pull request, and the workflow comments to say so
- Only a pull request from this repository's own branches: a fork's code never runs with a token that can push
