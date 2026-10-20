// The page's behaviour, not just the HTML it is served as: a DOM small enough to run the page's own
// inline script under `node:vm`, with its `fetch` pointed at a really running `skill-atlas serve`.
// Only what the script touches is implemented; anything else it reaches for is a plain failure.
//
// There is no stylesheet here: `hidden` is the property the script sets, not what a browser paints.
// A page whose CSS overrides `[hidden]` still looks hidden to this DOM, so whether an element is
// really off screen belongs in a test over the served CSS, not here.
import { createContext, runInContext } from 'node:vm';

/** One element of the tiny DOM: what the page's script does to a node, and nothing more. */
class Element {
  readonly children: Element[] = [];
  className = '';
  textContent = '';
  hidden = false;
  tabIndex = 0;
  value = '';
  placeholder = '';
  href = '';
  target = '';
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  readonly tagName: string;

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  append(...nodes: Element[]) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: Element[]) {
    this.children.length = 0;
    this.children.push(...nodes);
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  /** Fires the listeners for `type`, as a real event would. */
  dispatch(type: string, event: Record<string, unknown> = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener({ preventDefault() {}, target: this, ...event });
  }

  /** Every descendant matching `<tag>` or `<tag>.<class>`, in order. */
  querySelectorAll(selector: string): Element[] {
    const [tag, className] = selector.split('.');
    const found: Element[] = [];
    for (const child of this.children) {
      if (child.tagName === tag && (!className || child.className.split(/\s+/).includes(className))) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }

  querySelector(selector: string): Element | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  /** This node's text and all its descendants', as the page shows it. */
  get text(): string {
    return this.textContent + this.children.map((child) => child.text).join('');
  }
}

/** The page of a running server, its script evaluated, ready to be driven like a browser would. */
export type Page = {
  /** Scans `input` through the page's own code, and waits for the list it draws. */
  scan(input: string): Promise<void>;
  /** Types `query` into the filter, as a user does: the value, then the `input` event. */
  type(query: string): void;
  /** `<matched> of <all>`, beside the filter. */
  count(): string;
  /** The name of every skill the list shows, in order; the hidden ones are left out. */
  visible(): string[];
  /** The name of the skill chosen on the right, or `null`. */
  chosen(): string | null;
  /** Whether the filter is shown at all. */
  filterShown(): boolean;
  /** The filter's current text. */
  query(): string;
  /** An element by id, for anything the helpers above do not cover. */
  element(id: string): Element;
};

/**
 * Serves `/` from `address`, runs the script it contains, and returns the page it builds. `fetch`
 * inside the page is the real one, so `/api/scan` is answered by that same running server.
 */
export async function openPage(address: string): Promise<Page> {
  const html = await (await fetch(address)).text();
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!script) throw new Error('The page has no script');

  const byId = new Map<string, Element>();
  // The ids the script asks for, with the tag each one has in the page.
  for (const [id, tag] of [
    ['results', 'div'],
    ['search', 'div'],
    ['filter', 'input'],
    ['count', 'span'],
    ['file', 'section'],
    ['repo', 'input'],
    ['scan', 'form'],
  ] as const) {
    byId.set(id, new Element(tag));
  }
  // Shown or hidden as the page serves it.
  byId.get('search')!.hidden = /<div id="search"[^>]*\shidden[\s>]/.test(html);

  const context = createContext({
    document: {
      getElementById: (id: string) => byId.get(id) ?? null,
      createElement: (tag: string) => new Element(tag),
    },
    history: { replaceState() {} },
    location: { search: '' },
    // The page talks to the server it was served from, by absolute address.
    fetch: (path: string) => fetch(new URL(path, address)),
    URLSearchParams,
    console,
  });
  runInContext(script, context);

  const filter = byId.get('filter')!;
  const results = byId.get('results')!;
  const items = () => results.querySelectorAll('li.skill');
  const name = (item: Element) => item.querySelector('div.name')?.text ?? '';
  return {
    // The page's own `scan`, awaited: a `function` declaration in the script is a global of the
    // context, so the test can wait for the list instead of guessing how long the scan takes.
    scan: (input: string) => (context as { scan(input: string): Promise<void> }).scan(input),
    type(query: string) {
      filter.value = query;
      filter.dispatch('input');
    },
    count: () => byId.get('count')!.text,
    visible: () => items().filter((item) => !item.hidden).map(name),
    chosen() {
      const chosen = items().find((item) => item.getAttribute('aria-selected') === 'true');
      return chosen ? name(chosen) : null;
    },
    filterShown: () => !byId.get('search')!.hidden,
    query: () => filter.value,
    element: (id: string) => byId.get(id)!,
  };
}
