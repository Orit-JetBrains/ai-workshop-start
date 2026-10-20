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

`./skill-atlas serve` opens a local web view at http://127.0.0.1:4321/: a field for a
repository link, its skills, and each skill's SKILL.md.

Set `GITHUB_TOKEN` for a higher GitHub rate limit. `npm test` runs the tests.

To compare live scans of JetBrains/MPS, JetBrains/android and JetBrains/Koog
with checked-in output, run `npm run test:real`. The command uses `GITHUB_TOKEN`
or your existing `gh` login. It shows a diff if a result changes. Run
`npm run test:real:update` to refresh the snapshots after reviewing the changes.

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
