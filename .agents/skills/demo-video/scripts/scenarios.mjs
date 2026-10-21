// The prepared cases: what a demo recording shows, step by step. One entry per case; `record.mjs`
// drives them. A scenario only describes the page's actions and its captions — starting the server,
// capturing and encoding belong to the recorder.
//
// Each scenario gets `{ page, caption, type, wait, choose, countText, headingText }`:
//   caption(text)          the strip at the bottom of the frame; the video needs no sound
//   type(selector, text)   types a value a character at a time, so the typing is visible
//   wait(ms)               a pause to read by
//   choose(role, text)     hovers, then clicks the repository or skill whose text matches
//   countText()            `<matched> of <all>` beside the filter
//   headingText()          the result's heading, `<owner>/<repo> · N skills`
//
// `options` carries the case's inputs, so a new demo of the same shape needs no new code:
// `record.mjs <case> --set organization=JetBrains --set filter=kotlin`.

/** A repository picked from an organization's list and a filter query that matches some of it. */
const defaults = {
  organization: 'modelcontextprotocol',
  repository: 'inspector',
  organizationFilter: 'sdk',
  skillFilter: 'issue',
};

/** The organization scan: a URL with no repository part, and every repository that has skills. */
async function organizationScan({ caption, type, wait, page }, options) {
  await caption('1 · An organization URL scans every repository of the account');
  await type('#repo', `github.com/${options.organization}`);
  await wait(700);
  await page.click('form#scan button');
  await page.waitForSelector('#results li.repository', { timeout: 120_000 });
  const heading = (await page.textContent('#list h1'))?.trim();
  await caption(`${heading} — only the repositories with skills are listed, with their count`);
  await wait(3200);
}

/** The filter over an organization's list: the repositories' names. */
async function filterOrganization({ caption, type, wait, countText }, options) {
  await caption('2 · The filter narrows the list — here on the repositories’ names');
  await wait(1200);
  await type('#filter', options.organizationFilter);
  await wait(400);
  await caption(`Filtered to “${options.organizationFilter}”: ${await countText()} repositories`);
  await wait(2600);
}

/** A repository's skills: name, description and link. */
async function repositorySkills({ caption, wait, page, headingText }) {
  await page.waitForSelector('#results li.skill', { timeout: 120_000 });
  await caption(`${await headingText()} — name, description and link for each skill`);
  await wait(3000);
}

/** The filter over the skills: name or description, case-insensitively. */
async function filterSkills({ caption, type, wait, countText }, options, lead) {
  await caption(lead ?? 'The filter over the skills: name or description, case-insensitively');
  await wait(1200);
  await type('#filter', options.skillFilter);
  await wait(400);
  await caption(
    `Filtered to “${options.skillFilter}”: ${await countText()} skills — name or description`,
  );
  await wait(2600);
}

/** A skill, chosen: its SKILL.md, the whole file. */
async function openSkill({ caption, wait, choose }) {
  await choose('skill');
  await wait(600);
  await caption('A skill, chosen: its SKILL.md, the whole file, front matter included');
  await wait(3400);
}

export const scenarios = {
  /** Both features in one take — the recording checked in as docs/demo/skill-atlas-demo.mp4. */
  'organization-and-filter': {
    description: 'The organization scan, the filter over both lists, and a skill’s SKILL.md',
    defaults,
    async run(context, options) {
      const { caption, wait, choose } = context;
      await caption('skill-atlas serve — every SKILL.md in a repository, in the browser');
      await wait(1800);

      await organizationScan(context, options);
      await filterOrganization(context, options);

      await context.page.fill('#filter', '');
      await caption('Emptying the filter restores the whole list');
      await wait(1800);

      await caption('Choosing a repository scans it');
      await choose('repository', options.repository);
      await repositorySkills(context, options);

      await filterSkills(
        context,
        options,
        '3 · The same filter over the skills: name or description, case-insensitively',
      );
      await openSkill(context, options);

      await caption('Both features: the organization scan, and the filter');
      await wait(2000);
    },
  },

  /** The organization scan alone: the slowest path, and the one that needs GITHUB_TOKEN. */
  'organization-scan': {
    description: 'An organization URL: how many skills each of its repositories has',
    defaults,
    async run(context, options) {
      const { caption, wait } = context;
      await caption('skill-atlas serve — an organization, scanned');
      await wait(1500);
      await organizationScan(context, options);
      await caption('A count for each repository; the ones without skills are not listed');
      await wait(2500);
    },
  },

  /** One repository, typed in directly: its skills and one SKILL.md. */
  'repository-and-filter': {
    description: 'A single repository: its skills, the filter over them, and a SKILL.md',
    defaults,
    async run(context, options) {
      const { caption, type, wait, page } = context;
      await caption('skill-atlas serve — a repository’s skills');
      await wait(1500);
      await type('#repo', `github.com/${options.organization}/${options.repository}`);
      await wait(700);
      await page.click('form#scan button');
      await repositorySkills(context, options);
      await filterSkills(context, options);
      await openSkill(context, options);
      await caption('The filter, over a repository’s skills');
      await wait(1800);
    },
  },

  /** The back button: each scan is a step of the browser's history, so back is the list before it. */
  'back-button': {
    description: 'The back button: back from a repository is the organization’s list again',
    defaults,
    async run(context, options) {
      const { caption, wait, choose, page } = context;
      await caption('skill-atlas serve — the back button walks back through the scans');
      await wait(1500);

      await organizationScan(context, options);

      await caption('Choosing a repository scans it — a step of its own in the browser’s history');
      await choose('repository', options.repository);
      await repositorySkills(context, options);

      await caption('Now the browser’s back button');
      await wait(1500);
      await page.goBack();
      await page.waitForSelector('#results li.repository', { timeout: 120_000 });
      await caption(`Back: ${(await page.textContent('#list h1'))?.trim()} — the list the scan came from`);
      await wait(3200);

      await caption('Back again: the empty page the first scan was run from');
      await wait(1200);
      await page.goBack();
      await page.waitForFunction(() => document.querySelector('#results')?.children.length === 0, { timeout: 30_000 });
      await caption('The page it started from — the top bar, and nothing else');
      await wait(2600);
    },
  },

  /** The error path: an unreachable repository is answered in the page, not swallowed. */
  'unreachable-repository': {
    description: 'An unreachable repository: its message, in the page',
    defaults: { ...defaults, missing: 'modelcontextprotocol/no-such-repository-here' },
    async run({ caption, type, wait, page }, options) {
      await caption('skill-atlas serve — a repository that is not there');
      await wait(1500);
      await type('#repo', `github.com/${options.missing}`);
      await wait(700);
      await page.click('form#scan button');
      await page.waitForSelector('#results .error', { timeout: 120_000 });
      await caption('An unreachable repository → its message, in the page');
      await wait(3000);
    },
  },
};
