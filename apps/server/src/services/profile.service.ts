import { Profile, IProfile } from '../models/Profile.model.js';
import { ApiError } from '../middleware/error-handler.js';

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
  const profile = await Profile.findOne({ userId });

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  profile.skills.push(skillData as unknown as Parameters<typeof profile.skills.push>[0]);
  await profile.save();

  return profile.toJSON() as unknown as IProfile;
}

export async function updateSkill(userId: string, skillId: string, updates: Record<string, unknown>): Promise<IProfile | null> {
  const result = await Profile.findOneAndUpdate(
    { userId, 'skills._id': skillId },
    { $set: Object.fromEntries(Object.entries(updates).map(([k]) => [`skills.$.${k}`, (updates as Record<string, unknown>)[k]])) },
    { new: true }
  ).lean<IProfile>().exec();

  return result;
}

export async function deleteSkill(userId: string, skillId: string): Promise<IProfile> {
  const profile = await Profile.findOne({ userId });

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  profile.skills = profile.skills.filter((s) => s._id?.toString() !== skillId);
  await profile.save();

  return profile.toJSON() as unknown as IProfile;
}

// ─── Experience CRUD ──────────────────────────────────────────

export async function addExperience(userId: string, expData: Record<string, unknown>): Promise<IProfile> {
  const profile = await Profile.findOne({ userId });

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  profile.experience.push(expData as unknown as Parameters<typeof profile.experience.push>[0]);
  await profile.save();

  return profile.toJSON() as unknown as IProfile;
}

export async function updateExperience(userId: string, expId: string, updates: Record<string, unknown>): Promise<IProfile | null> {
  // For nested object updates, we need to be more careful
  const profile = await Profile.findOne({ userId });
  if (!profile) return null;

  const expIdx = profile.experience.findIndex((e) => e._id?.toString() === expId);
  if (expIdx === -1) return null;

  Object.assign(profile.experience[expIdx], updates);
  await profile.save();

  return profile.toJSON() as unknown as IProfile;
}

export async function deleteExperience(userId: string, expId: string): Promise<IProfile> {
  const profile = await Profile.findOne({ userId });

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  profile.experience = profile.experience.filter((e) => e._id?.toString() !== expId);
  await profile.save();

  return profile.toJSON() as unknown as IProfile;
}

// ─── Project CRUD ─────────────────────────────────────────────

export async function addProject(userId: string, projectData: Record<string, unknown>): Promise<IProfile> {
  const profile = await Profile.findOne({ userId });

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  profile.projects.push(projectData as unknown as Parameters<typeof profile.projects.push>[0]);
  await profile.save();

  return profile.toJSON() as unknown as IProfile;
}

export async function updateProject(userId: string, projectId: string, updates: Record<string, unknown>): Promise<IProfile | null> {
  const profile = await Profile.findOne({ userId });
  if (!profile) return null;

  const projIdx = profile.projects.findIndex((p) => p._id?.toString() === projectId);
  if (projIdx === -1) return null;

  Object.assign(profile.projects[projIdx], updates);
  await profile.save();

  return profile.toJSON() as unknown as IProfile;
}

export async function deleteProject(userId: string, projectId: string): Promise<IProfile> {
  const profile = await Profile.findOne({ userId });

  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Master profile not found.');

  profile.projects = profile.projects.filter((p) => p._id?.toString() !== projectId);
  await profile.save();

  return profile.toJSON() as unknown as IProfile;
}
