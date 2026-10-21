# Repository analysis
## Input
A **GitHub repository** URL, a **GitHub organization** or user URL, or a local directory
## Output
Every *project skill*: **name**, **description**, **link**, **last updated**; for an organization, each repository's **skill count**
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit, updatedAt
## Project skill
A file `<root>/<directory>/SKILL.md`, where `<root>` is a **skill root** at the top of the repository:
`.agents/skills`, `.claude/skills`, `.github/skills`, `agent/skills` (in that order)
- The name is exactly `SKILL.md`: `skill.md`, `Skill.md` are *not* skills
- Exactly one directory deep: not `<root>/SKILL.md`, not `<root>/<directory>/<sub>/SKILL.md`
- A skill root *below* the top (`plugins/x/.claude/skills/…`) is not one
- Anywhere else, a `SKILL.md` is *not* a project skill, and gets a *warning* (`<path>: not in a skill root; ignored`):
  the repository's root, `docs/`, test fixtures, vendored code; `node_modules/` is never part of a local directory
- Other files are not skills: `<root>/INDEX.md`, `<root>/<directory>/references/*.md`, `scripts/`
- Symbolic links are *not followed*: a linked file, directory or skill root is skipped
- A local directory: the same rules; `.git` is never part of it
## Copies
The **same directory** in several skill roots is *one skill*, as agents mirror their folders
- Its path is the *first root* in the order above with a *readable* file; the others are its *copies*
- The name and description come from that file; the copies may differ in content
- A copy whose name differs → a *warning* (`<path>: a copy of <path>, but named <name>`), still one skill;
  a copy with malformed front matter has no name to compare: only its own warning
- A copy GitHub fails to answer → a *warning*, the scan goes on; no file of the skill answered → the error, exit code 1
- Different directories with the same front matter name: *two skills*, sorted by path
- The **last updated** date is the *newest* of the copies': a mirrored skill is as fresh as its freshest folder
## Last updated
The date of the **last commit that touched the skill's `SKILL.md`**, so a skill left untouched for a year says so
- An **absolute** date, `2026-03-14`, the commit's day in **UTC**: never a relative one, which would move with
  the day a scan runs, and with it every snapshot, screenshot and demo
- **GitHub**: the commits API for the path, `?sha=<scanned commit>&path=<path>&per_page=1`, the scanned commit
  pinning the history as it pins the links. **One request per file of the skill**, its copies included, asked for
  at the same time as the files themselves: the date is wanted for *every* skill the CLI prints and the web view
  lists, not only a chosen one, so there is no cheaper moment to ask. It roughly *doubles* a repository's requests,
  which is why an unauthenticated scan — 60 requests an hour — reaches fewer repositories than before; `GITHUB_TOKEN`
  raises that limit, as it does for the rest of the scan
- A **local directory**: `git log -1 --format=%cI -- <path>`. A directory that is *not a git checkout*, or a machine
  with *no git*, has **no date**: the skills are listed without one
- No commit for the path, a file that history does not reach → **no date**
- The date is not the skill: a source that *fails* to answer for one → a *warning* (`<path>: <message>; no date`),
  the skill is still listed, and the scan goes on; a **rate limit** still *ends* it, as for the files themselves
- An organization's scan does not read it: it stays a **count** per repository
## Groups
A repository's skills are **divided by the words they share**: a *heuristic*, no model and no list of
topics — the words the skills' own authors chose are the grouping
- A group's **word** is one some skill's **name** uses: a name is what a skill is *called*, so it labels a
  group a reader recognises, where a description's `repo`, `run`, `fails` would label one nobody asked for
- A skill **joins** a group when the word is anywhere in its **name or its description**: `pr-flow`, whose
  name never says `issue`, is under `issue` because its description does
- The **strongest** word comes first and takes every skill it covers, then the strongest of what is left,
  until no word is left that two skills share. The strongest is the word the most **names** use, then the
  one the most **names and descriptions** use, then the **first alphabetically**
- A word **one skill alone** uses is that skill's own name, not something shared: a group needs **two**
- The **repository's own name** groups nothing: `mps-tests` and `mps-console` are both MPS's, and a group
  called `mps` in MPS divides nothing — what the whole repository is about cannot be what divides it
- A word is a run of letters and digits, lowercased, of **two characters** at least — `pr` and `v2` count,
  a bare number never does — and not one of the **common words** (`the`, `use`, `when`): a group called
  `the` says nothing about what is in it. No stemming: `commit` and `committing` are two words
- What shares no word with anything is the **last** group, the one with **no word**, shown as `other`
- **One group is no division**: nothing shared, or the same word in every skill, and the skills are shown
  with no word above them, as they were before there were groups
- The groups are the **scan's**, not a request's: the same skills always divide the same way. Within a
  group the skills keep the scan's order, **by name**
- Only the **name and the description** are read, never the SKILL.md body, and *nothing is stored*
- An organization's repositories are **not** grouped: a count is all each one has

## An organization
A **GitHub URL with no repository part** (`github.com/JetBrains`): every repository of the
organization — or of a **user account**, as both are listed — and how many project skills each has
- The repositories come from the GitHub API, *every page*; the account's own name is used, as GitHub spells it
- A repository's skills are **counted** from the *skill roots' trees* alone, and *no `SKILL.md` is read*:
  a skill's name is not needed for a count, so a copy's name is not compared and a malformed one costs nothing
- The rules are the scan's: one directory deep, the same directory in several roots is *one* skill, links are skipped
- A `SKILL.md` *outside* a skill root is **not** flagged here: finding one takes the whole tree of every repository
- `GITHUB_TOKEN` is **required**: without it GitHub allows 60 requests an hour → a clear message, exit code 1
- An unreachable organization or user → a clear message, exit code 1
- A repository GitHub fails to answer, an *empty* one say → a *warning*, the scan goes on; a *rate limit* ends it,
  unless it is a secondary one, waited out as in [Rate limits](#rate-limits)
- At most **8 repositories at a time**
- The web view scans an organization too, and a repository chosen from it
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The skills come from the *skill roots' trees*, which tell a symbolic link from a file
- A repository too large for one tree answer: no skill is lost, as the skill roots are listed apart;
  without `GITHUB_TOKEN`, the `SKILL.md` files outside them cannot be flagged → *one warning* that says so
- A skill root too large for one tree answer: each skill directory is listed on its own, no skill is lost
- `GITHUB_TOKEN`: code search finds the `SKILL.md` files to flag; past its 1000 results → *a warning*
- The name: front matter, else the directory
- No description → the skill is listed by name alone
- The link pins the *scanned commit*
- Malformed front matter → a *warning*, the scan goes on
- Listed but not readable at the scanned commit → a *warning*, skipped
- No project skills → `· 0 skills`, exit code 0
- Unreachable repository → a clear message, exit code 1
## Rate limits
- The **hour's requests spent** (`x-ratelimit-remaining: 0`) → the scan ends: a clear message, exit code 1
- A **secondary** rate limit, on how *fast* requests come, as an organization's scan can hit →
  *every* request of the scan pauses for the wait GitHub names in `retry-after`, else *a minute*, then goes on
- One request paused **three** times and still limited → the scan ends, as for the hour's requests
