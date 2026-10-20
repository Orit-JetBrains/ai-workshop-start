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

## An organization
`./skill-atlas scan github.com/<organization>`: a GitHub URL with **no repository part**, an
organization or a user account. `GITHUB_TOKEN` is *required* here, as 60 requests an hour
cannot reach an organization's repositories.
```
JetBrains · 865 repositories, 27 with skills
intellij-community · 38 skills
MPS · 41 skills
```
- `<organization> · <N> repositories, <M> with skills`, then *every* repository that **has** skills
- A **count**, not the skills themselves; sorted by **name**, repositories without skills are not listed
- A repository GitHub fails to answer → a *warning*; warnings go to *stderr*

## Live repository snapshots
`npm run test:real` scans JetBrains/MPS, JetBrains/android and JetBrains/Koog, and the
**Orit-JetBrains** organization, then compares stdout and warnings with the checked-in text in
`tests/snapshots/real-repos/`. The organization is a *small* one on purpose: a whole organization
such as JetBrains costs thousands of requests a run, most of an hour's quota.
The comparison ignores only the commit hash in GitHub skill links, and the tree hash in a
warning, so a new upstream commit without a changed result does not fail the check. A changed
skill, description, copy, count or warning produces a diff and a nonzero exit code.
`npm run test:real:update` refreshes the snapshots after all four scans succeed.
These live checks need `GITHUB_TOKEN` or an existing `gh` login and are separate
from the offline `npm test` suite.
