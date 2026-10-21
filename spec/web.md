# Web view
`./skill-atlas serve [port]`: a local web page, at `http://127.0.0.1:<port>/` (port *4321* by default, `0` for any free one).
Prints the address; it only listens on **127.0.0.1**. `GITHUB_TOKEN` works as for `scan`.
## Page
- A **field** for a repository: a GitHub URL or a local directory, as for `scan`; *Scan* runs it.
  An **organization** URL (`github.com/JetBrains`) works too, as for `scan`; `GITHUB_TOKEN` is *required* for it
- An organization's result: `<organization> · N repositories, M with skills`, then each repository that
  **has** skills with its **count**, sorted as for `scan`; the warnings below. Choosing a repository
  **scans it**: its URL goes into the field, and its skills replace the list
- The **filter** works on an organization's list as well: on the repositories' **names**, `<matched> of <all>`
- The result: `<owner>/<repo> · N skills`, then each skill's **name**, **description**, **last updated** date
  (`updated <date>`, beside the skill, nothing when it has none) and **link**, sorted as for `scan`;
  `also in <paths>` for copies; the warnings below
- The skills are shown in **groups**, as [the analysis](analysis.md#groups) finds them: the word above
  each one, `<word> · <N> skills`, the wordless group shown as `other` and last; a label, not something
  to choose. A repository whose skills make **one** group shows no word at all
- A group the filter **empties** is hidden with its skills, word and count: never a word with nothing under it
- The **top bar**: the field and *Scan* on the **left**, the **filter** on the **right**. Both are *always* shown,
  before a scan too, and stay on screen while the list scrolls
- The filter narrows the list to the skills whose **name** or **description** contains the query,
  case-insensitively; `<matched> of <all>` beside it, once there is a list. Emptying it restores the
  list; a scan empties it
- The filter looks in the **name** and the **description** alone: a date is not matched
- A skill, chosen: its path, its **last updated** date, and its **SKILL.md**, the whole file as text, front matter included
- `cluster=1` in the address: the groups come from `claude -p`, as
  [the analysis](analysis.md#clustering-with-a-model) asks for them, for every scan the page makes while
  it is there — a repository chosen from an organization included; its warnings are the page's warnings
- The first skill of the **list** is chosen after a scan — the first of the first group, which a group
  is only as `other` when nothing groups; `?repo=<input>` in the address scans it on load
- Each scan is a **step of its own** in the browser's history: **back** returns to the scan before it —
  an organization's list, for a repository chosen from it — and back past the first scan is the page
  before it, with no list and an empty field. A scan of the address already shown is **no** new step:
  the one `?repo=` runs on load, or the same input scanned twice
- Unreachable repository, or any other error → its message, in the page
## API
`GET /api/scan?repo=<input>[&cluster=1]` → JSON: `repository`, `skills` (each with its `link`, its `updatedAt`, an **ISO-8601**
date (`2026-03-14`) or `""` when it has none, its SKILL.md `text`, and its `group`, the word it shares — `""`
for the wordless one), `groups` (the groups in the order the page draws them: each one's `word` and how many
`skills` it has), `warnings`
- An organization → JSON: `organization`, `repositories` (how many), `withSkills` (each with its `id`, `name` and `skills`, a count), `warnings`
- An error → status 400, `{ "error": <message> }`; no `repo` → 400
- Each scan reads the repository again: *nothing is stored*
- Any other path → 404; a malformed request target → 400, and the server keeps serving. Malformed
  includes an **incomplete percent-escape** (`/%`, `/%zz`): a `%` that does not begin a `%XX` escape
