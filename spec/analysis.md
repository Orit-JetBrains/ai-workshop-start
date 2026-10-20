# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
## Output
Every *project skill*: **name**, **description**, **link**
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
- Its path is the *first root* in the order above; the others are its *copies*
- The name and description come from that file; the copies may differ in content
- A copy whose name differs → a *warning* (`<path>: a copy of <path>, but named <name>`), still one skill
- Different directories with the same front matter name: *two skills*, sorted by path
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- A repository too large for one tree answer: no skill is lost, as the skill roots are listed apart;
  without `GITHUB_TOKEN`, the `SKILL.md` files outside them cannot be flagged → *one warning* that says so
- The name: front matter, else the directory
- No description → the skill is listed by name alone
- The link pins the *scanned commit*
- Malformed front matter → a *warning*, the scan goes on
- Listed but not readable at the scanned commit → a *warning*, skipped
- No project skills → `· 0 skills`, exit code 0
- Unreachable repository → a clear message, exit code 1
