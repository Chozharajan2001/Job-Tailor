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
    { temperature: 0.1, maxTokens: 4096 }
  );

  // Robust sanitization / normalization before database write
  // 1. Skills Sanitization
  if (parsed.skills && Array.isArray(parsed.skills)) {
    const allowedCategories = new Set(['frontend', 'backend', 'devops', 'ai', 'mobile', 'database', 'other']);
    const allowedProficiencies = new Set(['beginner', 'intermediate', 'advanced', 'expert']);

    parsed.skills = parsed.skills.filter(skill => {
      if (!skill.name || !skill.name.trim()) return false;
      skill.name = skill.name.trim();

      if (!skill.category || !allowedCategories.has(skill.category)) {
        skill.category = 'other';
      }

      if (!skill.yearsOfExperience || isNaN(skill.yearsOfExperience) || skill.yearsOfExperience < 0) {
        skill.yearsOfExperience = 1;
      } else {
        skill.yearsOfExperience = Math.min(50, skill.yearsOfExperience);
      }

      if (!skill.proficiency || !allowedProficiencies.has(skill.proficiency)) {
        skill.proficiency = 'intermediate';
      }

      skill.isHighlighted = !!skill.isHighlighted;
      return true;
    });
  }

  // 2. Experience Sanitization
  if (parsed.experience && Array.isArray(parsed.experience)) {
    const allowedBulletTags = new Set(['frontend', 'backend', 'devops', 'ai', 'testing', 'leadership']);
    parsed.experience.forEach(exp => {
      if (!exp.company || !exp.company.trim()) {
        exp.company = 'Unknown Company';
      } else {
        exp.company = exp.company.trim();
      }

      if (!exp.role || !exp.role.trim()) {
        exp.role = 'Software Engineer';
      } else {
        exp.role = exp.role.trim();
      }

      if (!exp.startDate || !exp.startDate.trim()) {
        exp.startDate = '2024-01';
      }

      if (!exp.location || !exp.location.trim()) {
        exp.location = 'Remote';
      }

      if (exp.bullets && Array.isArray(exp.bullets)) {
        exp.bullets = exp.bullets.filter(bullet => {
          if (!bullet.text || !bullet.text.trim()) return false;
          bullet.text = bullet.text.trim();

          if (!bullet.id || !bullet.id.trim()) {
            bullet.id = 'b_' + Math.random().toString(36).substring(2, 11);
          }

          if (bullet.tags && Array.isArray(bullet.tags)) {
            bullet.tags = bullet.tags.filter(t => allowedBulletTags.has(t)) as any;
          } else {
            bullet.tags = [];
          }
          return true;
        });
      } else {
        exp.bullets = [];
      }
    });
  }

  // 3. Projects Sanitization
  if (parsed.projects && Array.isArray(parsed.projects)) {
    const allowedProjectTags = new Set(['frontend', 'backend', 'devops', 'ai', 'mobile']);
    parsed.projects.forEach(proj => {
      if (!proj.name || !proj.name.trim()) {
        proj.name = 'Project';
      } else {
        proj.name = proj.name.trim();
      }

      if (!proj.description || !proj.description.trim()) {
        proj.description = 'Project description';
      } else {
        proj.description = proj.description.trim();
      }

      if (!proj.startDate || !proj.startDate.trim()) {
        proj.startDate = '2024-01';
      }

      if (proj.tags && Array.isArray(proj.tags)) {
        proj.tags = proj.tags.filter(t => allowedProjectTags.has(t)) as any;
      } else {
        proj.tags = [];
      }
    });
  }

  // 4. Education Sanitization
  if (parsed.education && Array.isArray(parsed.education)) {
    parsed.education.forEach(edu => {
      if (!edu.institution || !edu.institution.trim()) {
        edu.institution = 'Unknown Institution';
      } else {
        edu.institution = edu.institution.trim();
      }

      if (!edu.degree || !edu.degree.trim()) {
        edu.degree = 'Degree';
      } else {
        edu.degree = edu.degree.trim();
      }

      if (!edu.field || !edu.field.trim()) {
        edu.field = 'General';
      } else {
        edu.field = edu.field.trim();
      }

      if (!edu.startYear || isNaN(edu.startYear)) {
        edu.startYear = 2018;
      } else {
        edu.startYear = Math.max(1980, Math.min(2035, edu.startYear));
      }

      if (edu.endYear && !isNaN(edu.endYear)) {
        edu.endYear = Math.max(1980, Math.min(2035, edu.endYear));
      }
    });
  }

  // 5. Certifications Sanitization
  if (parsed.certifications && Array.isArray(parsed.certifications)) {
    parsed.certifications.forEach(cert => {
      if (!cert.name || !cert.name.trim()) {
        cert.name = 'Certification';
      } else {
        cert.name = cert.name.trim();
      }

      if (!cert.issuer || !cert.issuer.trim()) {
        cert.issuer = 'Issuer';
      } else {
        cert.issuer = cert.issuer.trim();
      }

      if (!cert.date || !cert.date.trim()) {
        cert.date = '2024-01';
      }
    });
  }

  return parsed;
}
