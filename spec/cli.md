# Command line
`./skill-atlas scan <GitHub URL | directory> [--cluster | --compare]`
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
`--cluster`: the groups come from `claude -p` and the small model, as
[the analysis](analysis.md#clustering-with-a-model) asks for them, instead of from the words the skills
share; a model that cannot be asked costs a *warning*, not the scan. Not for an organization.
`--compare`: **both** groupings, side by side. Neither flag, and the groups are the words'.


## Output
```
JetBrains/kotlin · 6 skills

gradle · 2 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  updated 2026-03-14
  https://github.com/JetBrains/kotlin/blob/<commit>/…

other · 1 skill
…
```
- In **groups**, the word each one shares above it, as [the analysis](analysis.md#groups) finds them:
  `<word> · <N> skills`, a blank line before it, the wordless group shown as `other` and printed last.
  A repository whose skills make **one** group has no such line at all
- Sorted by **name** within the group; the description's *first sentence*
- `updated <date>` under the name: the skill's **last updated** date, as
  [the analysis](analysis.md#last-updated) reads it; a skill with *no* date has *no* such line
- `also in <paths>` for copies; warnings go to *stderr*

## Both groupings
`./skill-atlas scan <input> --compare` — the words the skills share on the **left**, the model's groups
on the **right**, in columns of **38** characters and two between them; a line too long for a column ends
in `…`. Then, below them, how much the two agree, as
[the analysis](analysis.md#comparing-the-two-groupings) measures it.
```
modelcontextprotocol/inspector · 11 skills

by the words they share                 by claude -p (claude-haiku-4-5)
issue · 3 skills                        issue · 3 skills
  issue-create                            issue-create
…                                       …
other · 2 skills                        other · 2 skills
  local-dev                               project-structure
  project-structure                       release

The two agree about 51 of the 55 pairs of skills.
```
- Each column is its **own list of groups**, as `scan` prints them: `<word> · <N> skills`, its skills under
  it by **name**, the wordless one as `other`, last. The columns do *not* line up group by group — the
  groups of one grouping are not the groups of the other, which is the point of printing both
- A grouping of **one** group is printed as one group here: there is a second column to read it against,
  so [one group is no division](#output) does not apply
- The skills, their dates and their links are *not* printed: a comparison is of the **groups**
- A **model that cannot be asked** has no column — `no groups: see the warning` — and no agreement line;
  the warning is the one `--cluster` gives, on *stderr*, and the exit code is still **0**
- Not for an organization: a clear message, exit code 1
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
skill, description, copy, date, count or warning produces a diff and a nonzero exit code.
`npm run test:real:update` refreshes the snapshots after all four scans succeed.
These live checks need `GITHUB_TOKEN` or an existing `gh` login and are separate
from the offline `npm test` suite.
