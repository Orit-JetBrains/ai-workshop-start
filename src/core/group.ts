// Grouping, by shared words alone: no model, no network, no list of topics to keep up to date.
// A repository's skills are named and described by the people who wrote them, and the words they
// reused are the grouping — `issue-create` and `issue-triage` share `issue`, and `pr-flow`, which
// never says it in its name, says it in its description.
import type { Skill } from './model.ts';

/** Skills that share a word, under the word itself; the word is empty for the ones that share none. */
export type SkillGroup = { word: string; skills: Skill[] };

/**
 * Words too common to group anything: a group called `the` says nothing about its skills. English's
 * own joining words, and the few verbs a description of a skill almost always uses to say when to
 * reach for it. Deliberately short — a long list of topic words would be the taste this heuristic
 * is meant to do without.
 */
const COMMON = new Set(
  `a an and any are as at be been but by can do does for from had has have how if in into is it its may
   must no nor not of on one only or other should so than that the their them then there these this those
   to too use used uses using very was what when where which while who why will with without you your`.split(/\s+/),
);

/** The words of a text, lowercased: what the heuristic sees of a name or a description. */
function words(text: string): Set<string> {
  const found = new Set<string>();
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/i)) {
    // Two letters at least, so `pr` and `v2` count and a stray `a` does not; never a bare number.
    if (word.length >= 2 && !COMMON.has(word) && !/^\d+$/.test(word)) found.add(word);
  }
  return found;
}

type Entry = { skill: Skill; name: Set<string>; text: Set<string> };

/**
 * A repository's skills, grouped by the words they share — `repository` is its own name, which never
 * groups anything: `mps-tests` and `mps-console` are both MPS's, and a group called `mps` in MPS
 * divides nothing.
 *
 * A group's word has to be one some skill's **name** uses: a name is what its author chose to call
 * the skill, so it makes a label a reader recognises, where a description's words — `repo`, `run`,
 * `fails` — make one nobody asked for. A skill joins a group when the word is anywhere in its name
 * or its description, which is how `pr-flow` lands under `issue`.
 *
 * The strongest word goes first, and takes the skills it covers: the word the most *names* use,
 * then the one the most names and descriptions use, then the first alphabetically. Then the next
 * strongest of what is left, until no word is left that two skills share. A skill that shares a
 * word with nothing goes into the last group, the one with no word.
 *
 * The groups come back in that order, strongest first, each skill in the order it came in; the
 * wordless group, when there is one, is last.
 */
export function groupSkills(skills: Skill[], repository: string): SkillGroup[] {
  const left: Entry[] = skills.map((skill) => ({ skill, name: words(skill.name), text: words(`${skill.name} ${skill.description}`) }));
  // The repository's own name is what all of its skills are about: `mps-tests` and `mps-console`
  // are both MPS's, and a group called `mps` in MPS divides nothing.
  const own = words(repository);
  const groups: SkillGroup[] = [];
  while (left.length > 0) {
    const word = strongestWord(left, own);
    if (!word) break;
    const members = left.filter((entry) => entry.text.has(word));
    groups.push({ word, skills: members.map((entry) => entry.skill) });
    for (const member of members) left.splice(left.indexOf(member), 1);
  }
  // Whatever shares no word with anything: one group, no word, last.
  if (left.length > 0) groups.push({ word: '', skills: left.map((entry) => entry.skill) });
  return groups;
}

/** The word that groups the most of what is left, or nothing when no two of them share one. */
function strongestWord(left: Entry[], own: Set<string>): string | undefined {
  const candidates = new Set(left.flatMap((entry) => [...entry.name]));
  let best: { word: string; names: number; texts: number } | undefined;
  for (const word of [...candidates].sort()) {
    const names = left.filter((entry) => entry.name.has(word)).length;
    const texts = left.filter((entry) => entry.text.has(word)).length;
    // A word one skill alone uses is not something shared; it is that skill's own name.
    if (texts < 2 || own.has(word)) continue;
    // Alphabetical order settles a tie, as the candidates are walked in it.
    if (!best || names > best.names || (names === best.names && texts > best.texts)) best = { word, names, texts };
  }
  return best?.word;
}

/**
 * Whether a grouping divides the skills at all: one group is no division — every skill shares the
 * same word, or none of them shares any — and then the list is printed and drawn without words
 * above it, as it was before there were groups.
 */
export function divides(groups: SkillGroup[]): boolean {
  return groups.length > 1;
}

/** Each skill's group word, by skill id: what the CLI prints above it and the page draws it under. */
export function groupWords(groups: SkillGroup[]): Map<string, string> {
  return new Map(groups.flatMap((group) => group.skills.map((skill) => [skill.id, group.word] as const)));
}
