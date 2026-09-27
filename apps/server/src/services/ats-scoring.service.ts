import { aiProviderManager } from "./ai-provider/provider-manager.js";
import { IParsedJD } from "../models/Job.model.js";
import { scoreKeywordsV2 } from "./keyword-scorer.js";
import { computeSkillIdfMap } from "./skill-idf.service.js";
import type {
  IATSScore,
  IMatchedSkill,
  IMissingSkill,
  IWeakSkill,
} from "../models/Resume.model.js";

/** Stamped on every IATSScore produced by this engine (see Resume.model atsSchema).
 *  1 = token-set keyword phase (pre-2026-09), 2 = synonym-aware graded credit + IDF. */
export const ATS_ENGINE_VERSION = 2;

// ─── Types ─────────────────────────────────────────────────────
export interface ResumeContent {
  summary: string;
  skills: Array<{
    name: string;
    category: string;
    yearsOfExperience: number;
    proficiency: string;
  }>;
  experience: Array<{ company: string; bullets: Array<{ text: string }> }>;
  projects: Array<{ name: string; techStack: string[]; highlights: string[] }>;
}

// ─── Keyword matching — v1 matcher replaced by keyword-scorer.ts (v2) ─────────────────────────────

// The v1 token-set matcher (extractKeywords + calculateKeywordScore) was
// replaced by keyword-scorer.ts (v2): synonym-aware graded credit with
// optional IDF weighting. v1 behavior is preserved in the golden fixture
// (src/tests/fixtures/ats-golden-cases.json) as the recorded delta history.

/**
 * Build matched skills table — which skills from JD exist in resume.
 */
function buildMatchedSkills(
  resumeSkills: Array<{ name: string }>,
  jd: IParsedJD,
): IMatchedSkill[] {
  const allJDSkills = [...jd.requiredSkills, ...jd.preferredSkills];
  const resumeSkillNames = new Set(
    resumeSkills.map((s) => s.name.toLowerCase()),
  );

  return allJDSkills.map((skill) => ({
    skill,
    presentInResume: resumeSkillNames.has(skill.toLowerCase()),
    presentInJD: true,
    weight: jd.requiredSkills.includes(skill) ? 2 : 1,
  }));
}

/**
 * Find missing skills — skills that JD requires but resume doesn't have.
 */
function findMissingSkills(
  resumeSkills: Array<{ name: string }>,
  jd: IParsedJD,
): IMissingSkill[] {
  const resumeSkillNames = new Set(
    resumeSkills.map((s) => s.name.toLowerCase()),
  );

  return jd.requiredSkills
    .filter((skill) => !resumeSkillNames.has(skill.toLowerCase()))
    .map((skill) => ({
      skill,
      required: true,
      suggestion: `Consider adding "${skill}" experience or a relevant project to strengthen your application.`,
    }));
}

/**
 * Find weak skills — skills user has but with less experience than JD likely needs.
 */
function findWeakSkills(
  resumeSkills: Array<{ name: string; yearsOfExperience: number }>,
  jd: IParsedJD,
): IWeakSkill[] {
  // Map common skills to expected years by seniority level
  const seniorityExpMap: Record<string, number> = {
    entry: 0.5,
    mid: 2,
    senior: 5,
    staff: 8,
    principal: 10,
  };

  const requiredExp = seniorityExpMap[jd.seniorityLevel] || 2;

  return resumeSkills
    .filter((rs) => {
      const isRequired = jd.requiredSkills.some(
        (jdSkill) => jdSkill.toLowerCase() === rs.name.toLowerCase(),
      );
      return isRequired && rs.yearsOfExperience < requiredExp;
    })
    .map((rs) => ({
      skill: rs.name,
      userYearsExp: rs.yearsOfExperience,
      requiredYearsExp: requiredExp,
      gap: Math.round((requiredExp - rs.yearsOfExperience) * 10) / 10,
      suggestion:
        rs.yearsOfExperience < 1
          ? `You have ${rs.name} listed but with limited experience. Consider a side project to demonstrate depth.`
          : `Your ${rs.name} experience (${rs.yearsOfExperience}y) is below typical requirements for this role. Highlight your best ${rs.name} work prominently.`,
    }));
}

/**
 * Generate action items based on gaps found.
 */
function generateActionItems(
  missing: IMissingSkill[],
  weak: IWeakSkill[],
): string[] {
  const items: string[] = [];

  if (missing.length > 0) {
    items.push(
      `Add top missing skills: ${missing
        .slice(0, 3)
        .map((m) => m.skill)
        .join(", ")}`,
    );
  }

  if (weak.length > 0) {
    items.push(
      `Strengthen weak skills: ${weak
        .slice(0, 3)
        .map((w) => w.skill)
        .join(", ")}`,
    );
  }

  items.push("Quantify achievements with metrics where possible");
  items.push("Tailor summary to use JD-specific keywords");

  return items;
}

// ─── Semantic Scoring via LLM ──────────────────────────────────

async function semanticScore(
  resume: ResumeContent,
  jd: IParsedJD,
): Promise<{ score: number | null; reasoning?: string }> {
  try {
    const prompt = `JOB DESCRIPTION:\n${JSON.stringify(jd)}\n\nRESUME:\n${JSON.stringify(resume)}`;
    const systemPrompt = `You are an ATS (Applicant Tracking System) evaluator. Score resumes against job descriptions on a scale of 0-100.

Respond ONLY with JSON: {"score": 0-100, "reasoning": "brief explanation"}`;

    interface SemanticScoreResponse {
      score: number;
      reasoning?: string;
    }

    const result =
      await aiProviderManager.generateStructuredOutput<SemanticScoreResponse>(
        prompt,
        systemPrompt,
        undefined,
        { temperature: 0.1, maxTokens: 300 },
      );

    const raw = Number(result?.score);
    if (!Number.isFinite(raw)) return { score: null };
    return {
      score: Math.min(100, Math.max(0, raw)),
      reasoning: result.reasoning,
    };
  } catch {
    // Never fabricate a score — null signals "LLM phase unavailable"
    return { score: null };
  }
}

/**
 * Calculate section completeness score.
 */
function calculateSectionCompleteness(resume: ResumeContent): number {
  let score = 0;
  const maxScore = 100;

  // Summary (20 points)
  if (resume.summary && resume.summary.length >= 50) score += 20;
  else if (resume.summary && resume.summary.length > 0) score += 10;

  // Skills (25 points)
  if (resume.skills.length >= 5) score += 25;
  else if (resume.skills.length >= 3) score += 15;
  else if (resume.skills.length > 0) score += 5;

  // Experience (30 points)
  if (resume.experience.length >= 1) {
    const hasBullets = resume.experience.every(
      (e) => e.bullets && e.bullets.length > 0,
    );
    if (hasBullets) score += 30;
    else score += 15;
  }

  // Projects (15 points)
  if (resume.projects.length >= 2) score += 15;
  else if (resume.projects.length === 1) score += 8;

  // Education (10 points) — we assume it's always there since it's in profile
  score += 10;

  return Math.min(score, maxScore);
}

/**
 * Check format quality (quantified bullets, etc.)
 */
function calculateFormatScore(resume: ResumeContent): number {
  let score = 60; // Base score for having content

  // Check for quantification patterns
  const allText = resume.experience
    .flatMap((e) => e.bullets.map((b) => b.text))
    .join(" ");
  const hasNumbers =
    /\d+%|\$\d+[,.]?\d*|\d+\s*(users|requests|team|projects|months|years)/i.test(
      allText,
    );
  if (hasNumbers) score += 20;

  // Check bullet count per experience
  const avgBullets =
    resume.experience.reduce((sum, e) => sum + (e.bullets?.length || 0), 0) /
    (resume.experience.length || 1);
  if (avgBullets >= 4) score += 20;
  else if (avgBullets >= 2) score += 10;

  return Math.min(score, 100);
}

// ─── Main Entry Point ──────────────────────────────────────────

/**
 * Full ATS scoring pipeline:
 * Phase 1: Keyword matching v2 (synonym-aware graded credit, IDF-weighted) — 35% weight
 * Phase 2: Semantic matching (LLM) — 45% weight
 * Phase 3: Section completeness — 12% weight
 * Phase 4: Format quality — 8% weight
 *
 * Final = weighted combination of all four phases.
 * If the LLM phase fails, the score is renormalized over the deterministic
 * phases and flagged `semanticScoreDegraded` — never fabricated.
 */
export async function scoreATS(
  resume: ResumeContent,
  jd: IParsedJD,
): Promise<IATSScore> {
  // Run independent scoring phases in parallel. The keyword phase is v2:
  // synonym-aware graded credit, optionally IDF-weighted from the CanonicalJob
  // corpus (empty map → plain required/preferred weights).
  const [semanticResult, keywordResult, sectionScore, formatScore] =
    await Promise.all([
      semanticScore(resume, jd),
      computeSkillIdfMap([...jd.requiredSkills, ...jd.preferredSkills]).then(
        (idfNorm) => scoreKeywordsV2(resume, jd, idfNorm),
      ),
      Promise.resolve(calculateSectionCompleteness(resume)),
      Promise.resolve(calculateFormatScore(resume)),
    ]);
  const keywordScore = keywordResult.score;

  const semanticDegraded = semanticResult.score === null;
  const semanticScoreValue = semanticResult.score ?? 0;

  // Weighted final score (renormalized when the LLM phase is unavailable)
  const overallScore = semanticDegraded
    ? Math.round(keywordScore * 0.55 + sectionScore * 0.25 + formatScore * 0.2)
    : Math.round(
        keywordScore * 0.35 +
          semanticScoreValue * 0.45 +
          sectionScore * 0.12 +
          formatScore * 0.08,
      );

  // Build breakdown
  const matchedSkills = buildMatchedSkills(resume.skills, jd);
  const missingSkills = findMissingSkills(resume.skills, jd);
  const weakSkills = findWeakSkills(
    resume.skills as Array<{
      name: string;
      yearsOfExperience: number;
      category: string;
      proficiency: string;
    }>,
    jd,
  );
  const actionItems = generateActionItems(missingSkills, weakSkills);
  if (semanticDegraded) {
    actionItems.unshift(
      "Semantic (AI) scoring was unavailable — this score reflects keyword, completeness and format analysis only. Re-run later for a full evaluation.",
    );
  }

  return {
    overallScore,
    keywordMatchScore: keywordScore,
    semanticMatchScore: semanticDegraded ? 0 : semanticScoreValue,
    sectionCompletenessScore: sectionScore,
    formatScore: formatScore,
    semanticScoreDegraded: semanticDegraded || undefined,
    engineVersion: ATS_ENGINE_VERSION,
    breakdown: {
      matchedSkills,
      missingSkills,
      weakSkills,
      actionItems,
    },
  };
}
