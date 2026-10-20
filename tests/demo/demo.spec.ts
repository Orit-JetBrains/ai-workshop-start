// docs/demo/skill-atlas-demo.mp4, as tests: the same five steps, over the same data, in a browser
// of the same size with the same fonts, and recorded. spec/demo.md says what is pinned and why.
//
// The data is tests/demo/github.json, a recording of the scan the demo ran live: the organization
// github.com/modelcontextprotocol and the repository the demo chooses from it. The numbers below
// are that recording's; `node scripts/record-demo.mjs` rewrites it, and then they move with it.
import { VIEWPORT } from '../../playwright.config.ts';
import { Atlas, MONO, SANS, expect, test } from './atlas.ts';

const ORGANIZATION = 'github.com/modelcontextprotocol';
const REPOSITORY = 'https://github.com/modelcontextprotocol/inspector';

/** The six repositories of the organization that have skills, with their counts, in the page's order. */
const WITH_SKILLS = ['conformance', 'csharp-sdk', 'inspector', 'kotlin-sdk', 'python-sdk', 'servers'];
const COUNTS = ['3 skills', '7 skills', '11 skills', '2 skills', '1 skill', '11 skills'];

/** The eleven skills of modelcontextprotocol/inspector, in the page's order. */
const SKILLS = [
  'board-ops',
  'issue-create',
  'issue-triage',
  'local-dev',
  'pr-flow',
  'pre-push-gate',
  'project-structure',
  'release',
  'security-advisory',
  'test-servers',
  'testing',
];

// The run is only as repeatable as the browser it runs in: if the viewport or the fonts ever stop
// being the demo's, this fails here rather than as a puzzling difference in a video.
test('the window and the fonts the demo was recorded in', async ({ atlas, page }) => {
  expect(page.viewportSize()).toEqual(VIEWPORT);
  expect(await page.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([VIEWPORT.width, VIEWPORT.height]);
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1);
  // The pinned families are loaded, and they are the ones the page is drawn with.
  expect(await page.evaluate(([sans, mono]) => [document.fonts.check(`400 1rem '${sans}'`), document.fonts.check(`400 1rem '${mono}'`)], [SANS, MONO])).toEqual([true, true]);
  await expect(atlas.repository).toHaveCSS('font-family', new RegExp(SANS));
});

test('1 · the organization scan', async ({ atlas }) => {
  await atlas.scan(ORGANIZATION);
  await expect(atlas.heading).toHaveText('modelcontextprotocol · 45 repositories, 6 with skills');
  await expect(atlas.repositories()).toHaveCount(6);
  expect(await atlas.names(atlas.repositories())).toEqual(WITH_SKILLS);
  await expect(atlas.repositories().locator('.description')).toHaveText(COUNTS);
  // Nothing is chosen yet: the right side says what to do.
  await expect(atlas.file).toHaveText('Choose a repository to see its skills.');
});

test("2 · the filter, on an organization's list", async ({ atlas }) => {
  await atlas.scan(ORGANIZATION);
  await expect(atlas.count).toHaveText('6 of 6');
  await atlas.type('sdk');
  await expect(atlas.count).toHaveText('3 of 6');
  expect(await atlas.names(atlas.repositories())).toEqual(['csharp-sdk', 'kotlin-sdk', 'python-sdk']);
  // Emptying the field restores the list.
  await atlas.clearFilter();
  await expect(atlas.count).toHaveText('6 of 6');
  expect(await atlas.names(atlas.repositories())).toEqual(WITH_SKILLS);
});

test('3 · a repository chosen from the organization', async ({ atlas }) => {
  await atlas.scan(ORGANIZATION);
  await atlas.repositories().filter({ hasText: 'inspector' }).click();
  // Its URL goes into the field, and its skills replace the list.
  await expect(atlas.repository).toHaveValue(REPOSITORY);
  await expect(atlas.heading).toHaveText('modelcontextprotocol/inspector · 11 skills');
  await expect(atlas.skills()).toHaveCount(11);
  expect(await atlas.names(atlas.skills())).toEqual(SKILLS);
  // Each skill with its name, its description and its link.
  const first = atlas.skills().first();
  await expect(first.locator('.description')).toContainText('gh recipes for the Inspector project boards');
  await expect(first.locator('a.link')).toHaveAttribute('href', `https://github.com/modelcontextprotocol/inspector/blob/074b8108f340590268f2900741403755e923a11c/.claude/skills/board-ops/SKILL.md`);
  // A scan empties the filter.
  await expect(atlas.filter).toHaveValue('');
  await expect(atlas.count).toHaveText('11 of 11');
});

test('4 · the filter, on the skills', async ({ atlas }) => {
  await atlas.scan(REPOSITORY);
  await atlas.type('issue');
  await expect(atlas.count).toHaveText('3 of 11');
  // The name or the description: pr-flow matches on its description alone.
  expect(await atlas.names(atlas.skills())).toEqual(['issue-create', 'issue-triage', 'pr-flow']);
  await expect(atlas.skills().filter({ hasText: 'pr-flow' }).locator('.description')).toContainText('issue');
  await atlas.clearFilter();
  await expect(atlas.count).toHaveText('11 of 11');
});

test('5 · a skill chosen, its SKILL.md', async ({ atlas }) => {
  await atlas.scan(REPOSITORY);
  // The first skill is chosen by the scan itself.
  expect(await atlas.chosen()).toMatchObject({ path: '.claude/skills/board-ops/SKILL.md' });
  await atlas.skills().filter({ hasText: 'issue-triage' }).click();
  const chosen = await atlas.chosen();
  expect(chosen.path).toBe('.claude/skills/issue-triage/SKILL.md');
  // The whole file as text, front matter included.
  expect(chosen.text.startsWith('---\n')).toBe(true);
  expect(chosen.text).toContain('name: issue-triage');
  expect(chosen.text).toContain('description: Triage unboarded Inspector issues');
  expect(chosen.text.length).toBeGreaterThan(1000);
});

// The demo itself, in one go: the five steps in their order, so one video shows what the mp4 shows.
test('the demo, end to end', async ({ atlas }) => {
  await atlas.scan(ORGANIZATION);
  await expect(atlas.heading).toHaveText('modelcontextprotocol · 45 repositories, 6 with skills');

  await atlas.type('sdk');
  await expect(atlas.count).toHaveText('3 of 6');
  await atlas.clearFilter();
  await expect(atlas.count).toHaveText('6 of 6');

  await atlas.repositories().filter({ hasText: 'inspector' }).click();
  await expect(atlas.heading).toHaveText('modelcontextprotocol/inspector · 11 skills');

  await atlas.type('issue');
  await expect(atlas.count).toHaveText('3 of 11');

  await atlas.skills().filter({ hasText: 'issue-triage' }).click();
  expect((await atlas.chosen()).path).toBe('.claude/skills/issue-triage/SKILL.md');
});

// Everything above is this page: a real `skill-atlas serve`, which reads the repository again on
// every scan and stores nothing. A reload shows the demo's starting point, not the last run's state.
test('a reload starts from an empty page', async ({ atlas, page }) => {
  await atlas.scan(ORGANIZATION);
  await page.goto('/');
  await expect(page.locator('#results')).toBeEmpty();
  await expect(new Atlas(page).filter).toHaveValue('');
});
