# fixture

A small repository for the tests.

| Path | Case |
| --- | --- |
| `.claude/skills/commits` | a skill |
| `agent/skills/commits` | its copy, in another agent's folder |
| `.github/skills/code-style` | a skill in another agent's folder |
| `agent/skills/code-style` | its copy, under another name: a warning |
| `.agents/skills/release-checklist` | malformed front matter |
| `.claude/skills/deploy` | no description |
| `.claude/skills/review-a`, `review-b` | two skills with the same name |
| `.claude/skills/lowercase/skill.md` | not named exactly `SKILL.md`: not a skill |
| `.claude/skills/SKILL.md` | directly in a skill root: flagged |
| `.claude/skills/commits/references/SKILL.md` | too deep: flagged |
| `.claude/skills/INDEX.md`, `commits/references/examples.md` | other files: not skills |
| `SKILL.md`, `docs/SKILL.md` | outside the skill roots: flagged |
| `plugins/tools/.claude/skills/nested` | a skill root below the top: flagged |

Symbolic links, `node_modules/` and an empty repository are made by the tests themselves.
