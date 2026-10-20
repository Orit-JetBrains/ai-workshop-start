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
- The result: `<owner>/<repo> · N skills`, then each skill's **name**, **description** and **link**, sorted as for `scan`;
  `also in <paths>` for copies; the warnings below
- The **top bar**: the field and *Scan* on the **left**, the **filter** on the **right**. Both are *always* shown,
  before a scan too, and stay on screen while the list scrolls
- The filter narrows the list to the skills whose **name** or **description** contains the query,
  case-insensitively; `<matched> of <all>` beside it, once there is a list. Emptying it restores the
  list; a scan empties it
- A skill, chosen: its **SKILL.md**, the whole file as text, front matter included
- The first skill is chosen after a scan; `?repo=<input>` in the address scans it on load
- Unreachable repository, or any other error → its message, in the page
## API
`GET /api/scan?repo=<input>` → JSON: `repository`, `skills` (each with its `link` and its SKILL.md `text`), `warnings`
- An organization → JSON: `organization`, `repositories` (how many), `withSkills` (each with its `id`, `name` and `skills`, a count), `warnings`
- An error → status 400, `{ "error": <message> }`; no `repo` → 400
- Each scan reads the repository again: *nothing is stored*
- Any other path → 404; a malformed request target → 400, and the server keeps serving
