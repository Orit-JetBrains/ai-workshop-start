// The key moments of the web view, as a browser paints them. The other tests check what the page
// says; these check what it looks like — the top bar that stays on screen, the two columns, the
// count beside the filter, the warning, an error in the page.
//
// Every moment is reached the way a user reaches it, then compared with its baseline in
// tests/e2e/screenshots to the pixel. See spec/screenshots.md.
import { expect, test } from '@playwright/test';
import { MISSING, ORGANIZATION, REPOSITORY } from './recording.ts';

/** The page, scanning `input` on load as `?repo=` does, waited for by what it draws. */
async function open(page: import('@playwright/test').Page, input?: string) {
  await page.goto(input ? `/?repo=${encodeURIComponent(input)}` : '/');
  if (input) await expect(page.locator('#results h1, #results p.error')).toBeVisible();
  // The web font of the page is the system one, but the layout settles a frame later; the first
  // paint of a fresh page is not what a user looks at.
  await page.waitForLoadState('networkidle');
}

test('before a scan: the field, Scan and the filter', async ({ page }) => {
  await open(page);
  await expect(page.locator('#repo')).toBeEmpty();
  await expect(page).toHaveScreenshot('before-a-scan.png');
});

test('an organization: its repositories with skills, each with its count', async ({ page }) => {
  await open(page, ORGANIZATION);
  await expect(page.locator('#results h1')).toHaveText('JetBrains · 4 repositories, 3 with skills');
  await expect(page.locator('li.repository')).toHaveCount(3);
  await expect(page).toHaveScreenshot('an-organization.png');
});

test('the filter on an organization: the names, and <matched> of <all>', async ({ page }) => {
  await open(page, ORGANIZATION);
  await page.locator('#filter').fill('intellij');
  await expect(page.locator('#count')).toHaveText('1 of 3');
  await expect(page).toHaveScreenshot('the-filter-on-repositories.png');
});

test('a repository chosen from the organization: its skills, the first one open', async ({ page }) => {
  await open(page, ORGANIZATION);
  await page.locator('li.repository', { hasText: 'kotlin' }).click();
  await expect(page.locator('#results h1')).toHaveText('JetBrains/kotlin · 3 skills');
  // Its URL went into the field, and the first skill's SKILL.md is on the right.
  await expect(page.locator('#repo')).toHaveValue(REPOSITORY);
  await expect(page.locator('#file pre')).toContainText('Bump the Gradle API');
  await expect(page).toHaveScreenshot('a-repository.png');
});

test('the filter on the skills: the name or the description', async ({ page }) => {
  await open(page, REPOSITORY);
  await page.locator('#filter').fill('commit');
  await expect(page.locator('#count')).toHaveText('1 of 3');
  await expect(page).toHaveScreenshot('the-filter-on-skills.png');
});

test('a skill chosen: its SKILL.md, the whole file', async ({ page }) => {
  await open(page, REPOSITORY);
  await page.locator('li.skill', { hasText: 'release-checklist' }).click();
  await expect(page.locator('#file h1')).toHaveText('.agents/skills/release-checklist/SKILL.md');
  await expect(page.locator('#file pre')).toContainText('description: The steps of a release');
  await expect(page).toHaveScreenshot('a-skill-chosen.png');
});

test('an unreachable repository: its message, in the page', async ({ page }) => {
  await open(page, MISSING);
  await expect(page.locator('#results p.error')).toHaveText(`Repository not found: ${MISSING}`);
  await expect(page).toHaveScreenshot('an-error.png');
});

// What the check is worth: the baselines above only mean something if the smallest possible change
// to the page breaks them. One pixel, painted over the page before a scan, must fail its baseline.
test('one changed pixel fails the check', async ({ page }, testInfo) => {
  // `--update-snapshots` rewrites a baseline that does not match: here that would be this very
  // pixel, written into the baseline the other tests compare against.
  test.skip(['all', 'changed'].includes(testInfo.config.updateSnapshots), 'the baselines are being remade');
  await open(page);
  // A single pixel, black on white, at a point the page leaves empty.
  await page.addStyleTag({ content: 'body::after { content: ""; position: fixed; left: 640px; top: 400px; width: 1px; height: 1px; background: #000; }' });
  await expect(async () => {
    await expect(page).toHaveScreenshot('before-a-scan.png', { timeout: 2_000 });
  }).rejects.toThrow(/1 pixels/);
});
