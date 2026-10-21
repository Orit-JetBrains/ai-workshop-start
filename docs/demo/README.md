# Demo

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

## The back button

[back-button.mp4](back-button.mp4) — 37 s, no sound, captions in the frame; the same server and
browser, the `back-button` case.

1. **The organization scan.** `github.com/modelcontextprotocol`: the 6 repositories with skills.
2. **A repository chosen from it.** `inspector` and its 11 skills — a step of its own in the
   browser's history, the address `?repo=…/inspector`.
3. **Back.** The organization's 6 repositories again, its URL back in the field: the list the scan
   came from, not a step out of the page.
4. **Back again.** The page the first scan was run from — the top bar, and nothing else.

Every step above is also a test: `npm run test:demo` replays this walkthrough in a browser against a
real `skill-atlas serve`, over a recording of the same scan, in the same 1280×760 window with
bundled fonts, and records each run as a video and a trace. See [spec/demo.md](../../spec/demo.md).

See [spec/web.md](../../spec/web.md) for what the page is specified to do, and
[spec/analysis.md](../../spec/analysis.md) for the organization and the grouping rules.

## Recording another one

This take is the `organization-and-filter` case of the
[demo-video](../../.agents/skills/demo-video/SKILL.md) skill:

```console
$ .agents/skills/demo-video/scripts/setup.sh                              # once per machine
$ node .agents/skills/demo-video/scripts/record.mjs --list
$ node .agents/skills/demo-video/scripts/record.mjs organization-and-filter \
    --out docs/demo/skill-atlas-demo.mp4
```

Other prepared cases cover the organization scan alone, a single repository, the back button and
the error path;
`--set organization=… --set repository=…` points any of them at another account.
