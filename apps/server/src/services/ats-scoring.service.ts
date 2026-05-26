import OpenAI from 'openai';
import { config } from '../config/index.js';
import { IParsedJD } from '../models/Job.model.js';
import type { IATSScore, IMatchedSkill, IMissingSkill, IWeakSkill } from '../models/Resume.model.js';

// ─── Types ─────────────────────────────────────────────────────
interface ResumeContent {
  summary: string;
  skills: Array<{ name: string; category: string; yearsOfExperience: number; proficiency: string }>;
  experience: Array<{ company: string; bullets: Array<{ text: string }> }>;
  projects: Array<{ name: string; techStack: string[]; highlights: string[] }>;
}

// ─── Simple TF-IDF Keyword Matcher ─────────────────────────────

/**
 * Extract keywords from text (lowercase, deduplicated).
 */
function extractKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s+#.-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  return new Set(words);
}

/**
 * Calculate keyword match score between resume content and JD.
 */
function calculateKeywordScore(resume: ResumeContent, jd: IParsedJD): number {
  let totalWeight = 0;
  let matchedWeight = 0;

  // Build resume keyword set
  const resumeText = [
    resume.summary,
    ...resume.skills.map((s) => s.name),
    ...resume.experience.flatMap((e) => e.bullets.map((b) => b.text)),
    ...resume.projects.flatMap((p) => [...p.techStack, ...p.highlights]),
  ].join(' ').toLowerCase();

  const resumeKeywords = extractKeywords(resumeText);

  // Score each required skill with weight based on JD focus area
  const allSkills = [...jd.requiredSkills, ...jd.preferredSkills];
  allSkills.forEach((skill) => {
    const skillLower = skill.toLowerCase();
    const weight = jd.requiredSkills.includes(skill) ? 2 : 1; // Required skills weighted higher
    totalWeight += weight;

    // Check if skill name (or its parts) appear in resume
    if (resumeKeywords.has(skillLower) || resumeText.includes(skillLower)) {
      matchedWeight += weight;
    }
  });

  return totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
}

/**
 * Build matched skills table — which skills from JD exist in resume.
 */
function buildMatchedSkills(
  resumeSkills: Array<{ name: string }>,
  jd: IParsedJD
): IMatchedSkill[] {
  const allJDSkills = [...jd.requiredSkills, ...jd.preferredSkills];
  const resumeSkillNames = new Set(resumeSkills.map((s) => s.name.toLowerCase()));

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
  jd: IParsedJD
): IMissingSkill[] {
  const resumeSkillNames = new Set(resumeSkills.map((s) => s.name.toLowerCase()));

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
  jd: IParsedJD
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
        (jdSkill) => jdSkill.toLowerCase() === rs.name.toLowerCase()
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
function generateActionItems(missing: IMissingSkill[], weak: IWeakSkill[]): string[] {
  const items: string[] = [];

  if (missing.length > 0) {
    items.push(`Add top missing skills: ${missing.slice(0, 3).map((m) => m.skill).join(', ')}`);
  }

  if (weak.length > 0) {
    items.push(`Strengthen weak skills: ${weak.slice(0, 3).map((w) => w.skill).join(', ')}`);
  }

  items.push('Quantify achievements with metrics where possible');
  items.push('Tailor summary to use JD-specific keywords');

  return items;
}

// ─── Semantic Scoring via LLM ──────────────────────────────────

async function semanticScore(
  resume: ResumeContent,
  jd: IParsedJD
): Promise<{ score: number; reasoning?: string }> {
  try {
    if (!config.openaiApiKey) return { score: 75 }; // Fallback if no API key configured
    const client = new OpenAI({ apiKey: config.openaiApiKey });

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an ATS (Applicant Tracking System) evaluator. Score resumes against job descriptions on a scale of 0-100.

Respond ONLY with JSON: {"score": 0-100, "reasoning": "brief explanation"}`,
        },
        {
          role: 'user',
          content: `JOB DESCRIPTION:\n${JSON.stringify(jd)}\n\nRESUME:\n${JSON.stringify(resume)}`,
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 300,
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{"score": 75}');
    return { score: Math.min(100, Math.max(0, result.score || 75)), reasoning: result.reasoning };
  } catch {
    return { score: 75 }; // Fallback on LLM failure
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
    const hasBullets = resume.experience.every((e) => e.bullets && e.bullets.length > 0);
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
  const allText = resume.experience.flatMap((e) => e.bullets.map((b) => b.text)).join(' ');
  const hasNumbers = /\d+%|\$\d+[\,.]?\d*|\d+\s*(users|requests|team|projects|months|years)/i.test(allText);
  if (hasNumbers) score += 20;

  // Check bullet count per experience
  const avgBullets = resume.experience.reduce((sum, e) => sum + (e.bullets?.length || 0), 0) / (resume.experience.length || 1);
  if (avgBullets >= 4) score += 20;
  else if (avgBullets >= 2) score += 10;

  return Math.min(score, 100);
}

// ─── Main Entry Point ──────────────────────────────────────────

/**
 * Full ATS scoring pipeline:
 * Phase 1: Keyword matching (TF-IDF style) — 35% weight
 * Phase 2: Semantic matching (LLM) — 45% weight
 * Phase 3: Section completeness — 12% weight
 * Phase 4: Format quality — 8% weight
 *
 * Final = weighted combination of all four phases.
 */
export async function scoreATS(
  resume: ResumeContent,
  jd: IParsedJD
): Promise<IATSScore> {
  // Run independent scoring phases in parallel
  const [semanticResult, keywordScore, sectionScore, formatScore] = await Promise.all([
    semanticScore(resume, jd),
    Promise.resolve(calculateKeywordScore(resume, jd)),
    Promise.resolve(calculateSectionCompleteness(resume)),
    Promise.resolve(calculateFormatScore(resume)),
  ]);

  // Weighted final score
  const overallScore = Math.round(
    keywordScore * 0.35 +
      semanticResult.score * 0.45 +
      sectionScore * 0.12 +
      formatScore * 0.08
  );

  // Build breakdown
  const matchedSkills = buildMatchedSkills(resume.skills, jd);
  const missingSkills = findMissingSkills(resume.skills, jd);
  const weakSkills = findWeakSkills(resume.skills as Array<{
    name: string;
    yearsOfExperience: number;
    category: string;
    proficiency: string;
  }>, jd);
  const actionItems = generateActionItems(missingSkills, weakSkills);

  return {
    overallScore,
    keywordMatchScore: keywordScore,
    semanticMatchScore: semanticResult.score,
    sectionCompletenessScore: sectionScore,
    formatScore: formatScore,
    breakdown: {
      matchedSkills,
      missingSkills,
      weakSkills,
      actionItems,
    },
  };
}
