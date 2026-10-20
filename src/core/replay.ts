import type { Fetch } from './github.ts';

/** One recorded GitHub answer: the status, the body, JSON or text, and any headers. */
export type Recorded = { status: number; body: unknown; headers?: Record<string, string> };

/** Recorded answers by request URL; a list is answered in turn, its last answer from then on. */
export type Recording = Record<string, Recorded | Recorded[]>;

/**
 * A fetch that answers from a recording. Any other URL goes to `fallback`,
 * or fails, so a replay never reaches the network by accident.
 */
export function replay(recording: Recording, fallback?: Fetch): Fetch {
  const asked = new Map<string, number>();
  return async (url, init) => {
    if (Object.hasOwn(recording, url)) {
      const answers = [recording[url]].flat();
      const times = asked.get(url) ?? 0;
      asked.set(url, times + 1);
      const { status, body, headers } = answers[Math.min(times, answers.length - 1)];
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
    }
    if (fallback) return fallback(url, init);
    throw new Error(`not recorded: ${url}`);
  };
}
