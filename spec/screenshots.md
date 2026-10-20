# Screenshots
`npm run e2e`: the **key moments** of the web view, as a browser paints them, compared with
checked-in **baselines**. `npm run e2e:update` remakes them, to be reviewed in the diff like any other change.
## The moments
One screenshot each, reached the way a user reaches it, on a really running `skill-atlas serve`:
- **Before a scan**: the field, *Scan* and the filter, with nothing scanned yet
- **An organization**: its repositories that have skills, each with its count
- **The filter on an organization**: a query over the names, and `<matched> of <all>`
- **A repository chosen from the organization**: its URL in the field, its skills, the first one open on the right,
  a *copy* (`also in …`) and a *warning*
- **The filter on the skills**: a query that matches a name or a description
- **A skill chosen**: its SKILL.md, the whole file
- **An unreachable repository**: its message, in the page
## The comparison
- **One changed pixel is a failure**: no tolerance, neither per pixel nor in how many differ.
  A test paints a single pixel over the page and *requires* its baseline to fail
- A screenshot that only passes on a second try is a *flake*: no retries
- **Nothing varies but the page**: the viewport, the theme, the locale and the time zone are pinned,
  and GitHub is answered from a *recording* (`tests/e2e/recording.ts`), so no scan of a real
  repository can redraw a baseline. The check reaches *no network*
- A **video** of every run, passing or failing, and a trace of a failing one, under `test-results/`
## Where they are taken
- In the **container** of `tests/e2e/Dockerfile`: one Node, one Chrome, one set of fonts, each pinned —
  the page is almost all text, and another font set renders it differently to the pixel
- `npm run e2e` builds it and runs the check inside it; **CI runs the same command**, so a baseline
  made on a laptop is the one CI compares against. The baselines are Linux's, as CI is
- The Chrome build is the one `@playwright/test` drives: its version, Node's and Playwright's are
  **bumped together**, and the baselines are remade when they are
