// What a company is allowed to see about a developer BEFORE they confirm an interview: the agent and the work.
// Built from an explicit allow-list so no identity field (name, photo, email, GitHub login, repo owner) can leak in by accident.

export type EvidenceRow = { kind: string; title: string; summary: string | null; source: string; status: string; data: Record<string, unknown> };
export type CandidateCard = {
  id: string; // opaque: the match id
  agent: { name: string; avatarSeed: string };
  score: number;
  reasons: string[];
  fit: "range fits" | "unknown";
  skills: { name: string; share: number; verified: boolean }[];
  projects: { title: string; summary: string; stack: string[]; commits: number | null; verified: boolean }[];
};

export function toCandidateCard(input: {
  matchId: string; score: number; reasons: string[]; fit: string;
  agent: { pet_name: string; avatar_seed: string }; evidence: EvidenceRow[];
}): CandidateCard {
  const skills = input.evidence
    .filter((e) => e.kind === "skill")
    .map((e) => ({ name: e.title, share: Number((e.data as { share?: number }).share ?? 0), verified: e.status === "verified" }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 6);

  const projects = input.evidence
    .filter((e) => e.kind === "project")
    .slice(0, 5)
    .map((e) => {
      const d = e.data as { private?: boolean; commits?: number; languages?: Record<string, number> };
      const stack = Object.keys(d.languages ?? {}).slice(0, 4);
      // Private repos: hide the name and the free-text description (either can identify the person or the employer).
      const isPrivate = d.private === true;
      return {
        title: isPrivate ? "Private project" : e.title,
        summary: isPrivate ? `Stack: ${stack.join(", ")}` : (e.summary ?? ""),
        stack,
        commits: typeof d.commits === "number" ? d.commits : null,
        verified: e.status === "verified",
      };
    });

  return {
    id: input.matchId,
    agent: { name: input.agent.pet_name, avatarSeed: input.agent.avatar_seed },
    score: input.score,
    reasons: input.reasons,
    fit: input.fit === "fits" ? "range fits" : "unknown",
    skills,
    projects,
  };
}
