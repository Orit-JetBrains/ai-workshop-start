# Command line
`./skill-atlas scan <GitHub URL | directory>`
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
```
- Sorted by **name**; the description's *first sentence*
- `also in <paths>` for copies; warnings go to *stderr*

## Live repository snapshots
`npm run test:real` scans JetBrains/MPS, JetBrains/android and JetBrains/Koog, then
compares stdout and warnings with the checked-in text in `tests/snapshots/real-repos/`.
The comparison ignores only the commit hash in GitHub skill links, so a new
upstream commit without a changed result does not fail the check. A changed
skill, description, copy or warning produces a diff and a nonzero exit code.
`npm run test:real:update` refreshes the snapshots after all three scans succeed.
These live checks need `GITHUB_TOKEN` or an existing `gh` login and are separate
from the offline `npm test` suite.
