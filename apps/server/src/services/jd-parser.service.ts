import OpenAI from 'openai';
import { config } from '../config/index.js';
import { IParsedJD } from '../models/Job.model.js';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!config.openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return openaiClient;
}

/**
 * Parse raw JD text into structured format using OpenAI.
 * Returns a typed IParsedJD object with skills, focus weights, seniority, etc.
 */
export async function parseJD(jdRawText: string): Promise<IParsedJD> {
  // Use GPT-4o-mini for cost-effective parsing
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are an expert job description parser for a resume tailoring tool called JobTailor.
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
- tone should match the JD's language style`,
      },
      {
        role: 'user',
        content: `Parse this job description:\n\n${jdRawText}`,
      },
    ],
    temperature: 0.2, // Low temperature for consistent parsing
    response_format: { type: 'json_object' },
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI API during JD parsing');
  }

  let parsed: IParsedJD;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Failed to parse JSON from OpenAI response');
  }

  // Validate required fields
  if (!parsed.summary || !parsed.requiredSkills || !parsed.focusWeights) {
    throw new Error('Incomplete parsing result from OpenAI — missing required fields');
  }

  return parsed;
}
