# Skill Atlas

Every agent skill in a repository: `./skill-atlas scan` finds each project skill, a `SKILL.md`
in `.agents/skills`, `.claude/skills`, `.github/skills` or `agent/skills`, and prints its name, description and link.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
…
```

`./skill-atlas scan github.com/<organization>` — a GitHub URL with no repository part — scans a whole
organization or user account instead: how many skills each of its repositories has. It needs `GITHUB_TOKEN`.

```console
$ ./skill-atlas scan github.com/JetBrains
JetBrains · 865 repositories, 27 with skills
intellij-community · 38 skills
MPS · 41 skills
…
```

`./skill-atlas serve` opens a local web view at http://127.0.0.1:4321/: a field for a
repository link, its skills, and each skill's SKILL.md. An organization link lists its repositories
with skills; choose one to see them.

Set `GITHUB_TOKEN` for a higher GitHub rate limit. `npm test` runs the tests: the Node ones, and the
demo's in a browser. The browser is Playwright's, installed once with `npx playwright install chromium ffmpeg`.

`npm run test:demo` runs the demo — the video below — as deterministic tests: the same recorded data,
the same 1280×760 window and the same bundled fonts on any machine, and every run recorded as a
video, a trace and a screenshot under `test-results/<run>/`. On CI, each step's screen must match
its image in `tests/demo/screenshots/`; to accept a change, label the pull request
`accept screenshots`. See [spec/demo.md](spec/demo.md);
`npm run test:demo:record` rewrites the recorded data with a fresh scan of live GitHub.

To compare live scans of JetBrains/MPS, JetBrains/android, JetBrains/Koog and the
Orit-JetBrains organization with checked-in output, run `npm run test:real`. The command uses `GITHUB_TOKEN`
or your existing `gh` login. It shows a diff if a result changes. Run
`npm run test:real:update` to refresh the snapshots after reviewing the changes.

- [docs/demo/](docs/demo/): a short video of the organization scan and the filter, in the web view.
- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
