/**
 * Keyword phase v2 for ATS scoring.
 *
 * Replaces the v1 token-set + substring match with graded credit:
 *   exact (1.0) > synonym (0.9, via the shared skill-matcher synonym groups)
 *   > multi-word token-subset (0.75) > none (0),
 * plus a +0.1 section-spread bonus (capped at 1.0) when the skill appears in
 * 2+ of the 4 resume sections, and optional IDF weighting from the user's
 * CanonicalJob corpus (skill-idf.service). Weights stay required=2, preferred=1.
 *
 * Pure and synchronous — the IDF map is injected by the caller.
 */
import { escapeRegex, getSynonymRegexString } from "../utils/skill-matcher.js";
import type { IParsedJD } from "../models/Job.model.js";
import type { ResumeContent } from "./ats-scoring.service.js";

export type MatchedBy = "exact" | "synonym" | "token-subset" | "none";

export interface SkillCredit {
  skill: string;
  weight: number;
  credit: number;
  matchedBy: MatchedBy;
  sections: number;
  effectiveWeight: number;
}

/** Same tokenizer contract as v1 (design doc §4.3): lowercase, strip
 *  everything except word chars/space/+#.-, split on whitespace, drop ≤1. */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s+#.-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
}

function sectionTexts(resume: ResumeContent): string[] {
  return [
    resume.summary ?? "",
    (resume.skills ?? []).map((s) => s.name).join(" "),
    (resume.experience ?? [])
      .flatMap((e) => (e.bullets ?? []).map((b) => b.text))
      .join(" "),
    (resume.projects ?? [])
      .flatMap((p) => [...(p.techStack ?? []), ...(p.highlights ?? [])])
      .join(" "),
  ];
}

export function scoreKeywordsV2(
  resume: ResumeContent,
  jd: IParsedJD,
  idfNorm?: Map<string, number>,
): { score: number; credits: SkillCredit[] } {
  const sections = sectionTexts(resume).map((s) => s.toLowerCase());
  const fullText = sections.join(" ");
  const resumeTokens = tokenize(fullText);

  const weighted: Array<{ skill: string; weight: number }> = [
    ...jd.requiredSkills.map((skill) => ({ skill, weight: 2 })),
    ...jd.preferredSkills.map((skill) => ({ skill, weight: 1 })),
  ];

  let totalEffective = 0;
  let earnedEffective = 0;
  const credits: SkillCredit[] = [];

  for (const { skill, weight } of weighted) {
    const exactRe = new RegExp(`(?<!\\w)${escapeRegex(skill)}(?!\\w)`, "i");
    const synonymRe = new RegExp(getSynonymRegexString(skill), "i");

    let matchedBy: MatchedBy = "none";
    let credit = 0;
    if (exactRe.test(fullText)) {
      matchedBy = "exact";
      credit = 1.0;
    } else if (synonymRe.test(fullText)) {
      matchedBy = "synonym";
      credit = 0.9;
    } else {
      const tokens = skill
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);
      if (tokens.length >= 2 && tokens.every((t) => resumeTokens.has(t))) {
        matchedBy = "token-subset";
        credit = 0.75;
      }
    }

    // Section spread: count sections that contain any form of the skill.
    let matchedSections = 0;
    if (matchedBy !== "none") {
      for (const section of sections) {
        if (exactRe.test(section) || synonymRe.test(section))
          matchedSections += 1;
      }
      if (matchedSections >= 2) credit = Math.min(1.0, credit + 0.1);
    }

    const effectiveWeight = weight * (idfNorm?.get(skill) ?? 1);
    totalEffective += effectiveWeight;
    earnedEffective += effectiveWeight * credit;
    credits.push({
      skill,
      weight,
      credit,
      matchedBy,
      sections: matchedSections,
      effectiveWeight,
    });
  }

  const score =
    totalEffective > 0
      ? Math.round((earnedEffective / totalEffective) * 100)
      : 0;
  return { score, credits };
}
