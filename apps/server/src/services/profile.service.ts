import { Profile, IProfile } from '../models/Profile.model.js';
import { ApiError } from '../middleware/error-handler.js';
import { parseResumeText } from './resume-parser.service.js';
import { PDFParse } from 'pdf-parse';
import fs from 'fs';

/**
 * Get or create a user's master profile.
 * Every user should have exactly one profile — created on first access.
 */
export async function getOrCreateProfile(userId: string): Promise<IProfile> {
  let profile = await Profile.findOne({ userId }).lean<IProfile>().exec();

  if (!profile) {
    profile = await Profile.create({
      userId,
      summary: '',
      skills: [],
      experience: [],
      projects: [],
      education: [],
      certifications: [],
      links: {},
    });
  }

  return profile;
}

/**
 * Get full profile with all nested data.
 */
export async function getFullProfile(userId: string): Promise<IProfile | null> {
  return Profile.findOne({ userId }).lean<IProfile>().exec();
}

/**
 * Update entire profile (full replace).
 */
export async function updateProfile(userId: string, updates: Record<string, unknown>): Promise<IProfile> {
  const profile = await Profile.findOneAndUpdate(
    { userId },
    { ...updates },
    { new: true, runValidators: true }
  ).lean<IProfile>().exec();

  if (!profile) {
    throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found. Create one first.');
  }

  return profile;
}

// ─── Skill CRUD ───────────────────────────────────────────────

export async function addSkill(userId: string, skillData: Record<string, unknown>): Promise<IProfile> {
  const profile = await Profile.findOneAndUpdate(
    { userId },
    { $push: { skills: skillData } },
    { new: true, runValidators: true }
  ).lean<IProfile>().exec();

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  return profile;
}

export async function updateSkill(userId: string, skillId: string, updates: Record<string, unknown>): Promise<IProfile | null> {
  const setObj = Object.fromEntries(
    Object.entries(updates)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [`skills.$.${k}`, v])
  );
  const result = await Profile.findOneAndUpdate(
    { userId, 'skills._id': skillId },
    { $set: setObj },
    { new: true }
  ).lean<IProfile>().exec();

  return result;
}

export async function deleteSkill(userId: string, skillId: string): Promise<IProfile> {
  const profile = await Profile.findOneAndUpdate(
    { userId },
    { $pull: { skills: { _id: skillId } } },
    { new: true }
  ).lean<IProfile>().exec();

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  return profile;
}

// ─── Experience CRUD ──────────────────────────────────────────

export async function addExperience(userId: string, expData: Record<string, unknown>): Promise<IProfile> {
  const profile = await Profile.findOneAndUpdate(
    { userId },
    { $push: { experience: expData } },
    { new: true, runValidators: true }
  ).lean<IProfile>().exec();

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  return profile;
}

export async function updateExperience(userId: string, expId: string, updates: Record<string, unknown>): Promise<IProfile | null> {
  const setObj = Object.fromEntries(
    Object.entries(updates)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [`experience.$.${k}`, v])
  );
  const result = await Profile.findOneAndUpdate(
    { userId, 'experience._id': expId },
    { $set: setObj },
    { new: true, runValidators: true }
  ).lean<IProfile>().exec();

  return result;
}

export async function deleteExperience(userId: string, expId: string): Promise<IProfile> {
  const profile = await Profile.findOneAndUpdate(
    { userId },
    { $pull: { experience: { _id: expId } } },
    { new: true }
  ).lean<IProfile>().exec();

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  return profile;
}

// ─── Project CRUD ─────────────────────────────────────────────

export async function addProject(userId: string, projectData: Record<string, unknown>): Promise<IProfile> {
  const profile = await Profile.findOneAndUpdate(
    { userId },
    { $push: { projects: projectData } },
    { new: true, runValidators: true }
  ).lean<IProfile>().exec();

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  return profile;
}

export async function updateProject(userId: string, projectId: string, updates: Record<string, unknown>): Promise<IProfile | null> {
  const setObj = Object.fromEntries(
    Object.entries(updates)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [`projects.$.${k}`, v])
  );
  const result = await Profile.findOneAndUpdate(
    { userId, 'projects._id': projectId },
    { $set: setObj },
    { new: true, runValidators: true }
  ).lean<IProfile>().exec();

  return result;
}

export async function deleteProject(userId: string, projectId: string): Promise<IProfile> {
  const profile = await Profile.findOneAndUpdate(
    { userId },
    { $pull: { projects: { _id: projectId } } },
    { new: true }
  ).lean<IProfile>().exec();

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  return profile;
}

/**
 * Upload a PDF resume, extract text, call AI parser, and populate the profile.
 */
export async function uploadAndPopulateProfile(
  userId: string,
  file: Express.Multer.File
): Promise<IProfile> {
  const dataBuffer = fs.readFileSync(file.path);
  const parser = new PDFParse({ data: dataBuffer });
  const textResult = await parser.getText();
  const rawText = textResult.text;

  if (!rawText || !rawText.trim()) {
    throw new ApiError(400, 'PDF_EMPTY', 'Could not extract text from the PDF file. Ensure the PDF is not a scanned image.');
  }
  // console.log(192, rawText);
  const parsedData = await parseResumeText(rawText);

  const profile = await Profile.findOneAndUpdate(
    { userId },
    {
      summary: parsedData.summary || '',
      skills: parsedData.skills || [],
      experience: parsedData.experience || [],
      projects: parsedData.projects || [],
      education: parsedData.education || [],
      certifications: parsedData.certifications || [],
      links: parsedData.links || {},
    },
    { new: true, upsert: true, runValidators: true }
  ).lean<IProfile>().exec();

  // Clean up temp file asynchronously
  fs.unlink(file.path, (err) => {
    if (err) console.error('Error deleting temp file:', err);
  });

  if (!profile) {
    throw new ApiError(500, 'PROFILE_UPDATE_FAILED', 'Failed to update profile.');
  }

  return profile;
}

// ─── Education CRUD ───────────────────────────────────────────

export async function addEducation(userId: string, eduData: Record<string, unknown>): Promise<IProfile> {
  const profile = await Profile.findOneAndUpdate(
    { userId },
    { $push: { education: eduData } },
    { new: true, runValidators: true }
  ).lean<IProfile>().exec();

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  return profile;
}

export async function updateEducation(userId: string, eduId: string, updates: Record<string, unknown>): Promise<IProfile | null> {
  const setObj = Object.fromEntries(
    Object.entries(updates)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [`education.$.${k}`, v])
  );
  const result = await Profile.findOneAndUpdate(
    { userId, 'education._id': eduId },
    { $set: setObj },
    { new: true, runValidators: true }
  ).lean<IProfile>().exec();

  return result;
}

export async function deleteEducation(userId: string, eduId: string): Promise<IProfile> {
  const profile = await Profile.findOneAndUpdate(
    { userId },
    { $pull: { education: { _id: eduId } } },
    { new: true }
  ).lean<IProfile>().exec();

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  return profile;
}

// ─── Certification CRUD ───────────────────────────────────────

export async function addCertification(userId: string, certData: Record<string, unknown>): Promise<IProfile> {
  const profile = await Profile.findOneAndUpdate(
    { userId },
    { $push: { certifications: certData } },
    { new: true, runValidators: true }
  ).lean<IProfile>().exec();

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  return profile;
}

export async function updateCertification(userId: string, certId: string, updates: Record<string, unknown>): Promise<IProfile | null> {
  const setObj = Object.fromEntries(
    Object.entries(updates)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [`certifications.$.${k}`, v])
  );
  const result = await Profile.findOneAndUpdate(
    { userId, 'certifications._id': certId },
    { $set: setObj },
    { new: true, runValidators: true }
  ).lean<IProfile>().exec();

  return result;
}

export async function deleteCertification(userId: string, certId: string): Promise<IProfile> {
  const profile = await Profile.findOneAndUpdate(
    { userId },
    { $pull: { certifications: { _id: certId } } },
    { new: true }
  ).lean<IProfile>().exec();

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  return profile;
}
