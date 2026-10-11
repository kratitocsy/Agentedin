// Pure matching logic: no database, no network. Scores a developer against a role using VERIFIED evidence only.
// A hunt's consent is scoped to role types and places, so a role outside that scope is ineligible, not just low-scoring.

export type Skill = { name: string; share: number }; // share = percent of verified code
export type DevEvidence = { skills: Skill[]; verifiedProjects: number };
export type RoleInput = { title: string; skills: string[]; locations: string[]; remote: boolean };
export type HuntInput = { roleTypes: string[]; places: string[]; blockedDomains: string[] };
export type MatchResult = { eligible: boolean; score: number; reasons: string[]; whyNot?: string };

export const MIN_SCORE = 40;

const canon = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9+#.]/g, "");

// A role skill is satisfied by any of these verified languages. Frameworks map to the languages they imply.
const SATISFIED_BY: Record<string, string[]> = {
  js: ["javascript"], javascript: ["javascript"], ts: ["typescript"], typescript: ["typescript"],
  node: ["javascript", "typescript"], nodejs: ["javascript", "typescript"], "node.js": ["javascript", "typescript"],
  react: ["javascript", "typescript"], nextjs: ["javascript", "typescript"], "next.js": ["javascript", "typescript"], vue: ["javascript", "typescript"],
  py: ["python"], python: ["python"], django: ["python"], flask: ["python"], fastapi: ["python"],
  go: ["go"], golang: ["go"], rust: ["rust"], java: ["java"], spring: ["java", "kotlin"], kotlin: ["kotlin"],
  ruby: ["ruby"], rails: ["ruby"], php: ["php"], laravel: ["php"], "c#": ["c#"], dotnet: ["c#"], ".net": ["c#"],
  "c++": ["c++"], cpp: ["c++"], c: ["c"], swift: ["swift"], dart: ["dart"], flutter: ["dart"],
  sql: ["plpgsql", "sql", "tsql"], postgres: ["plpgsql", "sql"], postgresql: ["plpgsql", "sql"], mysql: ["sql"],
  html: ["html"], css: ["css"], shell: ["shell"], bash: ["shell"],
};

function verifiedShare(dev: DevEvidence, roleSkill: string): { share: number; via: string } | null {
  const targets = SATISFIED_BY[canon(roleSkill)];
  if (!targets) return null; // not something GitHub languages can verify (e.g. "kubernetes")
  let best: { share: number; via: string } | null = null;
  for (const s of dev.skills) {
    if (targets.includes(canon(s.name)) && (!best || s.share > best.share)) best = { share: s.share, via: s.name };
  }
  return best ?? { share: 0, via: "" };
}

export function scoreMatch(dev: DevEvidence, role: RoleInput, hunt: HuntInput, companyDomain: string): MatchResult {
  const no = (whyNot: string): MatchResult => ({ eligible: false, score: 0, reasons: [], whyNot });
  const reasons: string[] = [];

  if (hunt.blockedDomains.map(canon).includes(canon(companyDomain))) return no("blocked_company");

  // Consent scope: role type
  const title = canon(role.title);
  const types = hunt.roleTypes.map(canon).filter(Boolean);
  const typeHit = types.find((t) => title.includes(t));
  if (types.length && !typeHit) return no("outside_role_scope");

  // Consent scope: place
  const places = hunt.places.map(canon).filter(Boolean);
  let placeFit = true;
  let placeNote = "Open to any location";
  if (places.length) {
    const remoteOk = role.remote && places.includes("remote");
    const shared = role.locations.map(canon).find((l) => places.includes(l));
    placeFit = remoteOk || Boolean(shared);
    placeNote = remoteOk ? "Remote role" : `Location fits: ${role.locations.find((l) => canon(l) === shared)}`;
  }
  if (!placeFit) return no("outside_place_scope");

  // Skills (55): share of verifiable role skills the developer has verified evidence for
  let skillPts = 0;
  const checks = role.skills.map((s) => ({ s, v: verifiedShare(dev, s) })).filter((x) => x.v !== null) as { s: string; v: { share: number; via: string } }[];
  if (role.skills.length === 0 || checks.length === 0) {
    skillPts = 27; // nothing verifiable to compare: neutral, never a bonus for guessing
  } else {
    const hits = checks.filter((c) => c.v.share >= 3);
    skillPts = Math.round((hits.length / checks.length) * 55);
    for (const h of hits.slice(0, 3)) reasons.push(`Verified ${h.v.via}: ${h.v.share}% of your code`);
  }
  // Role type (20)
  const typePts = types.length ? 20 : 10;
  if (typeHit) reasons.push(`Role type matches "${hunt.roleTypes.find((t) => canon(t) === typeHit)}"`);
  // Location (10)
  reasons.push(placeNote);
  // Evidence strength (15): verified project cards, capped at 3
  const projPts = Math.min(dev.verifiedProjects, 3) * 5;
  if (dev.verifiedProjects > 0) reasons.push(`${dev.verifiedProjects} verified project${dev.verifiedProjects > 1 ? "s" : ""}`);

  const score = Math.min(100, skillPts + typePts + 10 + projPts);
  return { eligible: true, score, reasons };
}
