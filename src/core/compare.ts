// Two groupings of the same skills, read against each other: the words they share and the model's.
//
// Groups cannot be compared by their words — `issue` and `issues` are the same group under different
// names, and `test` and `testing` are not — so they are compared by what they do to the skills: for
// every pair of skills, each grouping either puts the two together or does not, and the two groupings
// either say the same of that pair or disagree about it.
import type { SkillGroup } from './group.ts';
import type { Skill } from './model.ts';

/** How much two groupings of the same skills say the same thing. */
export type Agreement = {
  /** Every pair of skills: `n × (n - 1) / 2` of them. */
  pairs: number;
  /** The pairs both groupings put together, or both keep apart. */
  agree: number;
};

/** The group each skill is in, by skill id; a skill in no group at all is in none. */
function placed(groups: SkillGroup[]): Map<string, number> {
  const where = new Map<string, number>();
  groups.forEach((group, index) => {
    for (const skill of group.skills) where.set(skill.id, index);
  });
  return where;
}

/**
 * How the two groupings agree about `skills`: the pairs they both put together and the pairs they
 * both keep apart, out of every pair there is. The wordless group counts as a group like any other —
 * two skills in it are two skills the grouping kept out of everything else, which is a thing to say
 * about them, and the thing the other grouping is read against.
 */
export function agreement(skills: Skill[], a: SkillGroup[], b: SkillGroup[]): Agreement {
  const first = placed(a);
  const second = placed(b);
  let pairs = 0;
  let agree = 0;
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      pairs++;
      const together = (where: Map<string, number>) => where.get(skills[i].id) === where.get(skills[j].id);
      if (together(first) === together(second)) agree++;
    }
  }
  return { pairs, agree };
}
