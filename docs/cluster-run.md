# A real `claude -p` run

`--cluster` and `cluster=1` are specified in [spec/analysis.md](../spec/analysis.md#clustering-with-a-model)
and tested in [tests/cluster.test.ts](../tests/cluster.test.ts) through a stand-in for `claude -p`, which
answers without a model. The stand-in covers the flags, the prompt, the envelope, the validation and
every fallback — but not *what a model actually answers*. This file is that missing half: the groups a
real `claude -p` gave, recorded once, so the feature is not merged on a stand-in's word alone.

Re-record it with the commands below whenever the prompt, the flags or the model change.

- **Recorded** 2026-10-21, on a logged-in machine
- **CLI** `claude` 2.1.286, **model** `claude-haiku-4-5`, **Node** v25.2.1
- **Target** [`fixture/`](../fixture), scanned as its own repository: six skills, the largest set that
  can be scanned offline. `api.github.com` was not reachable from the recording machine, so a public
  GitHub repository was not an option.

## The groups, beside the words'

`./skill-atlas scan fixture --compare`, run four times:

```console
$ ./skill-atlas scan fixture --compare
fixture · 6 skills

by the words they share                 by claude -p (claude-haiku-4-5)
review · 2 skills                       commit · 2 skills
  review                                  code-style
  review                                  commits
other · 4 skills                        review · 2 skills
  code-style                              review
  commits                                 review
  deploy                                release · 2 skills
  release-checklist                       deploy
                                          release-checklist

The two agree about 11 of the 15 pairs of skills.
```

(Warnings about the fixture's own malformed and misplaced `SKILL.md` files are omitted; they are the
fixture's point, and the same with or without a model.)

## What held, and what did not

Across the four runs, and three more of `--cluster` alone:

- **The division held.** Every run put the same six skills into the same three pairs —
  `{code-style, commits}`, `{review, review}`, `{deploy, release-checklist}` — and agreed with the
  shared words about 11 of the 15 pairs every time. Nothing was left over, so no run printed `other`.
- **The labels did not.** The first group came back as `commit`, `code`, `style` and `standards` on
  different runs; the third as `release` and `deploy`. Each is a lowercase word of the skills' own, as
  asked, and each is a different word.
- **The order did not.** `review` came first in some runs and second in others: the groups are printed
  in the order the model gave them.

That is the cost the spec names — *a model does not answer the same way twice* — measured: on these
skills it moves the words above the groups and their order, not which skills are together. A run of
this is not a snapshot, which is why every demo screenshot, live snapshot and offline test stays pinned
to the shared-word groups.

- **No fallback fired.** No run warned: the CLI answered within the 120 s wait, `--output-format json`
  parsed, the JSON inside `result` was the shape it was asked for with no code fence, every label was a
  word within 24 characters, every number was a skill's, and the groups divided the skills.

## The web view

`cluster=1` reaches the same model. With `./skill-atlas serve 4399` running:

```console
$ curl -s 'http://127.0.0.1:4399/api/scan?repo=fixture&cluster=1'
{"groups":[{"word":"review","skills":2},{"word":"commit","skills":2},{"word":"release","skills":2}], …}
```

and each skill carried its group: `code-style` and `commits` under `commit`, `deploy` and
`release-checklist` under `release`, both `review`s under `review`.

## This repository

`./skill-atlas scan . --cluster` — three skills, the fewest a model is asked about at all — grouped
`code-review` and `issue-to-pr` under `review`, leaving `demo-video` in `other`. The shared words read
the same two together under `pr`: the same division, a different word.
