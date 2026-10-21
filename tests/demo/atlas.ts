// The demo's page, driven the way the demo drives it, and the two things that would otherwise
// differ between machines: the fonts and what the page is asked to show.
//
// The fonts are the files in tests/demo/fonts, served to the page by Playwright itself and forced
// onto every element, so the text is laid out identically wherever the run happens — a machine with
// no fonts at all included. The viewport is in playwright.config.ts.
import { readFileSync } from 'node:fs';
import { test as base, expect, type Locator, type Page } from '@playwright/test';

/** The fonts the page is pinned to, by the name it asks for them under. */
const FONTS: Record<string, string> = {
  'inter-400.woff2': 'inter-400.woff2',
  'inter-600.woff2': 'inter-600.woff2',
  'jetbrains-mono-400.woff2': 'jetbrains-mono-400.woff2',
};

/** The families every element is forced to; nothing falls back to whatever the machine has. */
export const SANS = 'Atlas Demo Sans';
export const MONO = 'Atlas Demo Mono';

const STYLE = `
@font-face { font-family: '${SANS}'; src: url('/demo-fonts/inter-400.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: block; }
@font-face { font-family: '${SANS}'; src: url('/demo-fonts/inter-600.woff2') format('woff2'); font-weight: 600; font-style: normal; font-display: block; }
@font-face { font-family: '${MONO}'; src: url('/demo-fonts/jetbrains-mono-400.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: block; }
:root, body, input, button, h1, li, div, span, a { font-family: '${SANS}', sans-serif !important; }
pre, code { font-family: '${MONO}', monospace !important; }
`;

/** The page of a running demo server: what the demo does to it, and what it shows. */
export class Atlas {
  readonly page: Page;
  readonly repository: Locator;
  readonly scanButton: Locator;
  readonly heading: Locator;
  readonly filter: Locator;
  readonly count: Locator;
  readonly file: Locator;

  constructor(page: Page) {
    this.page = page;
    this.repository = page.locator('#repo');
    this.scanButton = page.getByRole('button', { name: 'Scan' });
    this.heading = page.locator('#results h1');
    this.filter = page.locator('#filter');
    this.count = page.locator('#count');
    this.file = page.locator('#file');
  }

  /** Opens the page with the demo's fonts in place, and waits until they are the ones in use. */
  async open(query = '') {
    await this.page.goto(`/${query}`);
    await this.page.addStyleTag({ content: STYLE });
    await this.page.evaluate(
      async ([sans, mono]) => {
        await Promise.all([document.fonts.load(`400 1rem '${sans}'`), document.fonts.load(`600 1rem '${sans}'`), document.fonts.load(`400 1rem '${mono}'`)]);
        await document.fonts.ready;
      },
      [SANS, MONO],
    );
  }

  /** Types an input into the field and presses Scan, as the demo does; waits for the list. */
  async scan(input: string) {
    await this.repository.fill(input);
    await this.scanButton.click();
    await expect(this.heading).toBeVisible();
  }

  /** Types a query into the filter, a character at a time, as a user does. */
  async type(query: string) {
    await this.filter.click();
    await this.filter.pressSequentially(query, { delay: 60 });
  }

  /** Empties the filter, as the demo does to restore the list. */
  async clearFilter() {
    await this.filter.fill('');
  }

  /** The skills the list shows; the ones the filter hid are left out. */
  skills(): Locator {
    return this.page.locator('#results li.skill:visible');
  }

  /** The words above the groups of skills, the hidden ones left out, each with its count. */
  groups(): Locator {
    return this.page.locator('#results li.group:visible');
  }

  /** The repositories an organization's list shows, the hidden ones left out. */
  repositories(): Locator {
    return this.page.locator('#results li.repository:visible');
  }

  /** The names in a list, in order. */
  async names(items: Locator): Promise<string[]> {
    return items.locator('.name').allTextContents();
  }

  /** The skill chosen on the right: the path it was read from, its date, and its SKILL.md. */
  async chosen(): Promise<{ path: string; updated: string; text: string }> {
    return {
      path: (await this.file.locator('h1').textContent()) ?? '',
      updated: (await this.file.locator('.updated').textContent()) ?? '',
      text: (await this.file.locator('pre').textContent()) ?? '',
    };
  }
}

/** The demo's test: a page with the fonts pinned, already open. */
export const test = base.extend<{ atlas: Atlas }>({
  page: async ({ page }, use) => {
    // The font files, answered by Playwright: the server under test serves the page alone.
    await page.route('**/demo-fonts/*', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
      const file = FONTS[name];
      if (!file) return route.fulfill({ status: 404, body: 'Not a demo font' });
      return route.fulfill({ body: readFileSync(new URL(`fonts/${file}`, import.meta.url)), contentType: 'font/woff2' });
    });
    await use(page);
  },
  atlas: async ({ page }, use) => {
    const atlas = new Atlas(page);
    await atlas.open();
    await use(atlas);
  },
});

export { expect };
