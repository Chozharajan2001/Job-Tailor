import { aiProviderManager } from './ai-provider/provider-manager.js';

export interface ParsedProfile {
  summary: string;
  skills: Array<{
    name: string;
    category: 'frontend' | 'backend' | 'devops' | 'ai' | 'mobile' | 'database' | 'other';
    yearsOfExperience: number;
    proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    isHighlighted: boolean;
  }>;
  experience: Array<{
    company: string;
    role: string;
    startDate: string; // YYYY-MM
    endDate: string | null; // YYYY-MM or null
    location: string;
    isCurrentRole: boolean;
    description: string;
    bullets: Array<{
      id: string; // Generate a unique string id (e.g., UUID or simple random string)
      text: string;
      tags: ('frontend' | 'backend' | 'devops' | 'ai' | 'testing' | 'leadership')[];
    }>;
  }>;
  projects: Array<{
    name: string;
    description: string;
    techStack: string[];
    tags: ('frontend' | 'backend' | 'devops' | 'ai' | 'mobile')[];
    link?: string;
    github?: string;
    startDate: string; // YYYY-MM
    endDate?: string; // YYYY-MM
    highlights: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field: string;
    startYear: number;
    endYear?: number;
    gpa?: string;
  }>;
  certifications: Array<{
    name: string;
    issuer: string;
    date: string; // YYYY-MM or YYYY
    credentialUrl?: string;
  }>;
  links: {
    github?: string;
    linkedin?: string;
    portfolio?: string;
    website?: string;
  };
}

/**
 * Parse raw resume text into structured profile JSON using OpenAI.
 */
export async function parseResumeText(resumeRawText: string): Promise<ParsedProfile> {
  const systemPrompt = `You are an expert resume parser for JobTailor.
Your task is to analyze raw resume text and extract all relevant candidate information into a strictly structured JSON profile.

Rules:
1. Output valid JSON only, conforming to the schema requested. No markdown blocks, code fences, or explanations.
2. For skills, determine:
   - "category": must be one of: 'frontend' | 'backend' | 'devops' | 'ai' | 'mobile' | 'database' | 'other'.
   - "yearsOfExperience": estimated number based on work experience context.
   - "proficiency": must be one of: 'beginner' | 'intermediate' | 'advanced' | 'expert'.
   - "isHighlighted": set true if the skill is core or prominently featured.
3. For experience bullets, make sure:
   - "id": generate a random string ID (e.g. "b1", "b2" or random alphanumeric).
   - "tags": assign relevant tags from: 'frontend' | 'backend' | 'devops' | 'ai' | 'testing' | 'leadership'.
4. For projects, tags should be from: 'frontend' | 'backend' | 'devops' | 'ai' | 'mobile'.
5. Convert all dates to 'YYYY-MM' format if possible.
6. Make sure to extract links (linkedin, github, portfolio, website) if they exist.

JSON Structure:
{
  "summary": "Professional summary...",
  "skills": [
    { "name": "React", "category": "frontend", "yearsOfExperience": 3, "proficiency": "advanced", "isHighlighted": true }
  ],
  "experience": [
    {
      "company": "Company Name",
      "role": "Software Engineer",
      "startDate": "2022-01",
      "endDate": "2023-12",
      "location": "New York, NY",
      "isCurrentRole": false,
      "description": "Role overview",
      "bullets": [
        { "id": "bullet-1", "text": "Achieved X...", "tags": ["frontend", "testing"] }
      ]
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "Desc...",
      "techStack": ["React"],
      "tags": ["frontend"],
      "link": "https://...",
      "github": "https://...",
      "startDate": "2021-06",
      "endDate": "2021-08",
      "highlights": ["Bullet point 1", "Bullet point 2"]
    }
  ],
  "education": [
    {
      "institution": "University Name",
      "degree": "Bachelor of Science",
      "field": "Computer Science",
      "startYear": 2018,
      "endYear": 2022,
      "gpa": "3.8"
    }
  ],
  "certifications": [
    { "name": "AWS Certified Solutions Architect", "issuer": "AWS", "date": "2023-05", "credentialUrl": "" }
  ],
  "links": {
    "github": "",
    "linkedin": "",
    "portfolio": "",
    "website": ""
  }
}`;

  const parsed = await aiProviderManager.generateStructuredOutput<ParsedProfile>(
    `Parse this resume text:\n\n${resumeRawText}`,
    systemPrompt,
    undefined,
    { temperature: 0.1, maxTokens: 3500 }
  );

  return parsed;
}
