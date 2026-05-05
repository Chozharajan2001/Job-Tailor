// ============================================================
// JobTailor — Shared TypeScript Types (Client ↔ Server)
// ============================================================

// ─── Common Types ────────────────────────────────────────────
export type ID = string;

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    total: number;
    page: number;
    pages: number;
    limit: number;
  };
}

// ─── Auth Types ──────────────────────────────────────────────
export interface IUser {
  _id: ID;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAuthTokens {
  user: Omit<IUser, 'passwordHash'>;
  accessToken: string;
  refreshToken: string;
}

// ─── Profile / Skill Types ───────────────────────────────────
type SkillCategory = 'frontend' | 'backend' | 'devops' | 'ai' | 'mobile' | 'database' | 'other';
type SkillProficiency = 'beginner' | 'intermediate' | 'advanced' | 'expert';
type ExperienceTag = 'frontend' | 'backend' | 'devops' | 'ai' | 'testing' | 'leadership';

export interface ISkill {
  _id?: ID;
  name: string;
  category: SkillCategory;
  yearsOfExperience: number;
  proficiency: SkillProficiency;
  isHighlighted: boolean;
}

export interface IBullet {
  id: string;
  text: string;
  tags: ExperienceTag[];
  usedInResumes: number;
}

export interface IExperience {
  _id?: ID;
  company: string;
  role: string;
  startDate: string;
  endDate: string | null;
  location: string;
  isCurrentRole: boolean;
  description: string;
  bullets: IBullet[];
}

export interface IProject {
  _id?: ID;
  name: string;
  description: string;
  techStack: string[];
  tags: ExperienceTag[];
  link?: string;
  github?: string;
  startDate: string;
  endDate?: string;
  highlights: string[];
}

export interface IEducation {
  _id?: ID;
  institution: string;
  degree: string;
  field: string;
  startYear: number;
  endYear?: number;
  gpa?: string;
}

export interface ICertification {
  _id?: ID;
  name: string;
  issuer: string;
  date: string;
  credentialUrl?: string;
}

export interface IProfileLinks {
  github?: string;
  linkedin?: string;
  portfolio?: string;
  website?: string;
}

export interface IProfile extends Document {
  _id: ID;
  userId: ID;
  summary: string;
  skills: ISkill[];
  experience: IExperience[];
  projects: IProject[];
  education: IEducation[];
  certifications: ICertification[];
  links: IProfileLinks;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Job / JD Types ──────────────────────────────────────────
type WorkType = 'remote' | 'hybrid' | 'onsite';
type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'internship';
type SeniorityLevel = 'entry' | 'mid' | 'senior' | 'staff' | 'principal';
type JDTone = 'formal' | 'casual' | 'technical' | 'corporate';
type ApplicationStatus = 'saved' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn';

export interface IFocusWeights {
  frontend: number;
  backend: number;
  devops: number;
  ai: number;
  mobile: number;
}

export interface IParsedJD {
  summary: string;
  seniorityLevel: SeniorityLevel;
  focusWeights: IFocusWeights;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  qualifications: string[];
  niceToHaves: string[];
  tone: JDTone;
}

export interface IJob {
  _id: ID;
  userId: ID;
  companyName: string;
  jobTitle: string;
  jobLink?: string;
  location: string;
  workType: WorkType;
  employmentType: EmploymentType;
  salaryRange?: { min: number; max: number; currency: string };
  postedDate?: Date;
  jdRawText: string;
  parsedJD: IParsedJD | null;
  status: ApplicationStatus;
  notes: INote[];
  appliedDate?: Date;
  savedAt: Date;
  updatedAt: Date;
}

// ─── Resume Types ───────────────────────────────────────────
type ResumeStatus = 'draft' | 'generated' | 'downloaded' | 'used';

export interface IMatchedSkill {
  skill: string;
  presentInResume: boolean;
  presentInJD: boolean;
  weight: number;
}

export interface IMissingSkill {
  skill: string;
  required: boolean;
  suggestion: string;
}

export interface IWeakSkill {
  skill: string;
  userYearsExp: number;
  requiredYearsExp: number;
  gap: number;
  suggestion: string;
}

export interface IATSScore {
  overallScore: number;
  keywordMatchScore: number;
  semanticMatchScore: number;
  sectionCompletenessScore: number;
  formatScore: number;
  breakdown: {
    matchedSkills: IMatchedSkill[];
    missingSkills: IMissingSkill[];
    weakSkills: IWeakSkill[];
    actionItems: string[];
  };
}

export interface IResume {
  _id: ID;
  userId: ID;
  jobId: ID;
  version: number;
  versionLabel: string;
  tailoredSummary: string;
  skillIds: ID[];
  experienceIds: ID[];
  projectIds: ID[];
  sectionOrder: string[];
  atsScore: IATSScore;
  pdfUrl?: string;
  status: ResumeStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Application Tracker Types ──────────────────────────────
export interface INote {
  id: string;
  content: string;
  createdAt: Date;
}

export interface ITimelineEvent {
  event: string;
  description: string;
  eventDate: Date;
  type: 'status_change' | 'note' | 'reminder' | 'follow_up' | 'interview_schedule';
}

export interface IReminder {
  message: string;
  dueDate: string; // ISO date
  isCompleted: boolean;
  completedAt?: Date;
}

export interface IApplication {
  _id: ID;
  userId: ID;
  jobId: IJob;
  resumeId: IResume;
  status: ApplicationStatus;
  previousStatus: ApplicationStatus[];
  timelineEvents: ITimelineEvent[];
  reminders: IReminder[];
  callbackReceived: boolean;
  rejectedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Analytics Types ─────────────────────────────────────────
export interface IDashboardOverview {
  totalApplications: number;
  thisWeekApplied: number;
  interviewRate: number;
  averageATSScore: number;
  topMatchingSkills: string[];
  commonGaps: string[];
  pipelineFunnel: Record<ApplicationStatus, number>;
  resumePerformance: Array<{
    versionLabel: string;
    usageCount: number;
    callbackRate: number;
  }>;
}
