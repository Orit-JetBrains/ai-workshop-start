# Web view
`./skill-atlas serve [port]`: a local web page, at `http://127.0.0.1:<port>/` (port *4321* by default, `0` for any free one).
Prints the address; it only listens on **127.0.0.1**. `GITHUB_TOKEN` works as for `scan`.
## Page
- A **field** for a repository: a GitHub URL or a local directory, as for `scan`; *Scan* runs it.
  **One repository** only: an organization URL (`github.com/JetBrains`) says to scan it with the CLI
- The result: `<owner>/<repo> · N skills`, then each skill's **name**, **description** and **link**, sorted as for `scan`;
  `also in <paths>` for copies; the warnings below
- A **filter** above the list: it narrows the list to the skills whose **name** or **description**
  contains the query, case-insensitively; `<matched> of <all>` beside it. Emptying it restores the
  list; a scan empties it
- A skill, chosen: its **SKILL.md**, the whole file as text, front matter included
- The first skill is chosen after a scan; `?repo=<input>` in the address scans it on load
- Unreachable repository, or any other error → its message, in the page
## API
`GET /api/scan?repo=<input>` → JSON: `repository`, `skills` (each with its `link` and its SKILL.md `text`), `warnings`
- An error → status 400, `{ "error": <message> }`; no `repo` → 400
- Each scan reads the repository again: *nothing is stored*
- Any other path → 404; a malformed request target → 400, and the server keeps serving
