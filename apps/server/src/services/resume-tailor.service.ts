import { aiProviderManager } from './ai-provider/provider-manager.js';
import { IParsedJD } from '../models/Job.model.js';
import { IProfile } from '../models/Profile.model.js';
import type { IATSScore } from '../models/Resume.model.js';
import { scoreATS } from './ats-scoring.service.js';

// ─── Types ─────────────────────────────────────────────────────
export interface TailoredResume {
  tailoredSummary: string;
  skills: IProfile['skills'];
  experience: IProfile['experience'];
  projects: IProfile['projects'];
  sectionOrder: string[];
  atsScore: IATSScore;
}

interface TailorOptions {
  rewriteSummary?: boolean;
  reorderSections?: boolean;
  maxBulletsPerRole?: number;
  maxProjects?: number;
}

// ─── Section Reordering Logic ──────────────────────────────────

/**
 * Determine optimal section order based on JD focus weights.
 * If JD is backend-heavy, put skills & experience first, etc.
 */
function determineSectionOrder(focusWeights: IParsedJD['focusWeights']): string[] {
  const baseOrder = ['summary', 'skills', 'experience', 'projects', 'education'];

  // Sort sections by focus area priority
  const priorityMap: Record<string, string[]> = {
    frontend: ['skills', 'projects', 'experience'],
    backend: ['skills', 'experience', 'projects'],
    devops: ['skills', 'experience', 'projects'],
    ai: ['skills', 'projects', 'experience'],
    mobile: ['skills', 'projects', 'experience'],
  };

  // Find highest focus area
  const areas = Object.entries(focusWeights).sort(([, a], [, b]) => b - a);
  const topArea = areas[0][0];
  const priority = priorityMap[topArea] || priorityMap.backend;

  // Reorder: priority sections first (within base order constraints)
  const orderedSections = [...new Set([...priority.filter((s) => baseOrder.includes(s)), ...baseOrder])];

  return orderedSections;
}

/**
 * Reorder and select bullets within each experience block.
 * Bullets matching the top focus area tags get prioritized.
 */
function prioritizeBullets(
  experiences: IProfile['experience'],
  focusWeights: IParsedJD['focusWeights'],
  maxBullets: number
): IProfile['experience'] {
  // Determine primary tag from highest weight
  const entries = Object.entries(focusWeights) as [string, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const primaryTag = entries[0]?.[0] || 'backend';

  return experiences.map((exp) => ({
    ...exp,
    bullets: exp.bullets
      .sort((a, b) => {
        const aScore = a.tags.includes(primaryTag as never) ? 1 : 0;
        const bScore = b.tags.includes(primaryTag as never) ? 1 : 0;
        return bScore - aScore;
      })
      .slice(0, maxBullets),
  }));
}

/**
 * Select and sort projects by relevance to JD focus.
 */
function selectRelevantProjects(
  projects: IProfile['projects'],
  jdSkills: string[],
  maxProjects: number
): IProfile['projects'] {
  if (!Array.isArray(projects)) return [];

  const scored = projects.map((p) => {
    let relevance = 0;
    const techLower = (p.techStack || []).map((t: string) => t.toLowerCase());
    const highlightsLower = (p.highlights || []).map((h: string) => h.toLowerCase());

    jdSkills.forEach((skill) => {
      const s = skill.toLowerCase();
      if (techLower.some((t: string) => t.includes(s) || s.includes(t))) relevance += 2;
      if (highlightsLower.some((h: string) => h.includes(s) || s.includes(h))) relevance += 1;
    });

    return { project: p, relevance };
  });

  return scored
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, maxProjects)
    .map((s) => s.project);
}

// ─── LLM Summary Rewriter ──────────────────────────────────────

async function rewriteSummary(
  currentSummary: string,
  profile: IProfile,
  jd: IParsedJD
): Promise<string> {
  try {
    const prompt = `CURRENT SUMMARY: ${currentSummary || '(none provided)'}

CANDIDATE PROFILE:
- Skills: ${(profile.skills || []).map((s) => s.name).join(', ')}
- Experience: ${JSON.stringify(profile.experience?.map((e) => `${e.role} at ${e.company}`))}
- Projects: ${JSON.stringify(profile.projects?.map((p) => `${p.name} — ${p.description}`))}

TARGET JOB DESCRIPTION:
- Role: ${jd.summary}
- Required Skills: ${jd.requiredSkills.join(', ')}
- Focus: Backend ${jd.focusWeights.backend}%, Frontend ${jd.focusWeights.frontend}%, DevOps ${jd.focusWeights.devops}%, AI ${jd.focusWeights.ai}%

Rewrite the summary for this specific job.`;

    const systemPrompt = `You are an expert resume writer. Rewrite professional summaries to match job descriptions.

Rules:
- Keep it to 2-3 sentences maximum
- Naturally incorporate keywords from the target JD
- Match the tone of the JD (${jd.tone})
- Highlight relevant skills from the candidate's profile
- Do NOT fabricate skills or experience
- Respond with ONLY the rewritten summary text, no quotes or explanation`;

    const completion = await aiProviderManager.generateCompletion(
      prompt,
      systemPrompt,
      { temperature: 0.5, maxTokens: 200 }
    );

    return completion.content.trim() || currentSummary;
  } catch {
    return currentSummary; // Fallback on error
  }
}

// ─── Main Entry Point ──────────────────────────────────────────

/**
 * Generate a tailored resume from master profile + parsed JD.
 * This is the core "magic" of JobTailor:
 * 1. Select/reorder skills by JD relevance
 * 2. Prioritize bullets matching JD focus area
 * 3. Pick most relevant projects
 * 4. Rewrite summary using JD keywords/tone
 * 5. Score ATS match
 */
export async function tailorResume(
  profile: IProfile,
  jd: IParsedJD,
  options: TailorOptions = {}
): Promise<TailoredResume> {
  const {
    rewriteSummary: shouldRewriteSummary = true,
    maxBulletsPerRole = 4,
    maxProjects = 3,
  } = options;

  // 1. Skills — keep all but order: highlighted first, then by category matching JD focus
  const sortedSkills = [...(profile.skills || [])].sort((a, b) => {
    if (a.isHighlighted !== b.isHighlighted) return a.isHighlighted ? -1 : 1;
    return 0;
  });

  // 2. Experience — reorder bullets by relevance
  const tailoredExperience = prioritizeBullets(
    profile.experience || [],
    jd.focusWeights,
    maxBulletsPerRole
  );

  // 3. Projects — pick most relevant ones
  const tailoredProjects = selectRelevantProjects(
    profile.projects || [],
    [...jd.requiredSkills, ...jd.preferredSkills],
    maxProjects
  );

  // 4. Summary — rewrite via LLM
  const tailoredSummary = shouldRewriteSummary
    ? await rewriteSummary(profile.summary || '', profile, jd)
    : profile.summary || '';

  // 5. Section ordering
  const sectionOrder = determineSectionOrder(jd.focusWeights);

  // 6. ATS Scoring
  const atsScore = await scoreATS(
    {
      summary: tailoredSummary,
      skills: sortedSkills,
      experience: tailoredExperience,
      projects: tailoredProjects as unknown as TailoredResume['projects'],
    },
    jd
  );

  return {
    tailoredSummary,
    skills: sortedSkills,
    experience: tailoredExperience,
    projects: tailoredProjects as unknown as TailoredResume['projects'],
    sectionOrder,
    atsScore,
  };
}
