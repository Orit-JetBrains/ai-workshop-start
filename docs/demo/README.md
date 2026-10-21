# Demo

Two takes, both silent, both captioned in the frame:
[skill-atlas-demo.mp4](skill-atlas-demo.mp4), the walkthrough, and
[skill-atlas-promo.mp4](skill-atlas-promo.mp4), the short one for a post.

## skill-atlas-demo.mp4 — the walkthrough

[skill-atlas-demo.mp4](skill-atlas-demo.mp4) — 40 s, no sound, captions in the frame. A real
`./skill-atlas serve` driven in a browser against live GitHub.

What it shows, in order:

1. **The organization scan.** `github.com/modelcontextprotocol` in the field: 45 repositories
   scanned, the 6 with skills listed with their counts.
2. **The filter, on an organization's list.** `sdk` narrows it to `3 of 6` — the repositories'
   names; emptying the field restores the list.
3. **A repository chosen from the organization.** `inspector` goes into the field and its 11
   skills replace the list, each with its name, description, last updated date and link, in
   groups of the words they share: `issue` 3, `board` 2, `gate` 2, `test` 2, `other` 2.
4. **The filter, on the skills.** `issue` narrows it to `3 of 11`, matching the name or the
   description — not the date; the groups it empties go with their skills, and the `issue`
   group is all that is left.
5. **A skill chosen** — its last updated date, and its SKILL.md, the whole file, front matter
   included.

Every step above is also a test: `npm run test:demo` replays this walkthrough in a browser against a
real `skill-atlas serve`, over a recording of the same scan, in the same 1280×760 window with
bundled fonts, and records each run as a video and a trace. See [spec/demo.md](../../spec/demo.md).

See [spec/web.md](../../spec/web.md) for what the page is specified to do, and
[spec/analysis.md](../../spec/analysis.md) for the organization and the grouping rules.

## skill-atlas-promo.mp4 — 30 s, the problem first

[skill-atlas-promo.mp4](skill-atlas-promo.mp4) — 31 s. The take for a post or a channel, where a
viewer has not read the README and will not watch forty seconds of a tool they have no reason to
want yet. It opens on the problem and only then shows the answer:

- **0–10 s, the problem, drawn.** Not the app at all: a cartoon developer in front of a wall of
  eighteen repository cards. Three beats — *“Our organization has 45 repositories”*, then a
  question mark over every card and *“Which of them have skills?”*, then a shrug and *“Nobody
  knows. There is no list.”* The page is
  [intro.html](../../.agents/skills/demo-video/scripts/intro.html), drawn in the same browser and
  captured in the same take, so there is nothing to splice.
- **10–31 s, the answer, live.** `github.com/modelcontextprotocol` typed into the real app:
  45 repositories scanned, the 6 with skills and their counts, `inspector` chosen for its 11 skills
  with descriptions, dates and links, and the filter narrowing them to `3 of 11`.

The numbers in the cartoon's first beat match the scan the second half performs — a promo that
promises 45 repositories and then scans 12 reads as a mock-up. `--set organization=…` changes the
scan; the caption in `intro.html` has to move with it.

## Recording another one

The walkthrough is the `organization-and-filter` case, and the promo the `problem-and-solution`
case, of the
[demo-video](../../.agents/skills/demo-video/SKILL.md) skill:

```console
$ .agents/skills/demo-video/scripts/setup.sh                              # once per machine
$ node .agents/skills/demo-video/scripts/record.mjs --list
$ node .agents/skills/demo-video/scripts/record.mjs organization-and-filter \
    --out docs/demo/skill-atlas-demo.mp4
$ node .agents/skills/demo-video/scripts/record.mjs problem-and-solution \
    --out docs/demo/skill-atlas-promo.mp4
```

Other prepared cases cover the organization scan alone, a single repository, and the error path;
`--set organization=… --set repository=…` points any of them at another account.
