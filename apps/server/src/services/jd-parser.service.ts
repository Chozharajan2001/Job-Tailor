import { aiProviderManager } from './ai-provider/provider-manager.js';
import { IParsedJD } from '../models/Job.model.js';

/**
 * Parse raw JD text into structured format using the AI provider manager.
 * Returns a typed IParsedJD object with skills, focus weights, seniority, etc.
 */
export async function parseJD(jdRawText: string): Promise<IParsedJD> {
  const systemPrompt = `You are an expert job description parser for a resume tailoring tool called JobTailor.
You analyze job descriptions and extract structured information.

IMPORTANT: Respond ONLY with valid JSON — no markdown, no code fences, no explanation.
Use this exact JSON structure:
{
  "summary": "1-2 sentence overview of what the role is about",
  "seniorityLevel": "entry|mid|senior|staff|principal",
  "focusWeights": {
    "frontend": 0-100,
    "backend": 0-100,
    "devops": 0-100,
    "ai": 0-100,
    "mobile": 0-100
  },
  "requiredSkills": ["skill1", "skill2"],
  "preferredSkills": ["skill1"],
  "responsibilities": ["resp1", "resp2"],
  "qualifications": ["qual1", "qual2"],
  "niceToHaves": ["nice1"],
  "tone": "formal|casual|technical|corporate"
}

Rules:
- focusWeights must sum to ~100 (representing % emphasis)
- Extract ALL technical skills/tools/frameworks mentioned
- Separate requiredSkills (must-have) vs preferredSkills (bonus points)
- Determine seniorityLevel from title and experience requirements
- tone should match the JD's language style`;

  const parsed = await aiProviderManager.generateStructuredOutput<IParsedJD>(
    `Parse this job description:\n\n${jdRawText}`,
    systemPrompt,
    undefined,
    { temperature: 0.2, maxTokens: 2000 }
  );

  // Validate required fields
  if (!parsed.summary || !parsed.requiredSkills || !parsed.focusWeights) {
    throw new Error('Incomplete parsing result from AI provider — missing required fields');
  }

  return parsed;
}
