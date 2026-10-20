# Repository analysis
## Input
A **GitHub repository** URL, a **GitHub organization** or user URL, or a local directory
## Output
Every *project skill*: **name**, **description**, **link**; for an organization, each repository's **skill count**
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit
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
