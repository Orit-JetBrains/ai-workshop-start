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
Two more hold the run itself to the spec: the viewport and the fonts are the demo's, and a reload
starts from an empty page. Screenshots are kept as a record, not compared against checked-in images:
they are identical for a given browser build, not across them.
