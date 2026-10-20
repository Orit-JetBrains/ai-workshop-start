# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Tests
Integration tests for every case in the spec.
## Definition of done
- All tests pass locally
- The CI build is green

## When done
Open a pull request.
Attach a demo video when the change is **visible in the web view**: record it with the
[demo-video](.agents/skills/demo-video/SKILL.md) skill, commit it under [docs/demo/](docs/demo/),
and link it in the PR body. Not applicable when there is nothing to watch — the CLI's output, a
refactor, docs; a screenshot or the printed output belongs there instead.

## Commands
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests
