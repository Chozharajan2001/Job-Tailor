import { Request, Response } from 'express';
import * as profileService from '../services/profile.service.js';

/**
 * GET /api/v1/profile
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const profile = await profileService.getOrCreateProfile(userId);

  res.json({ success: true, data: { profile } });
}

/**
 * PUT /api/v1/profile — Full replace of master profile.
 */
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const profile = await profileService.updateProfile(userId, req.body);

  res.json({ success: true, data: { profile } });
}

// ─── Skills ───────────────────────────────────────────────────

export async function addSkill(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const profile = await profileService.addSkill(userId, req.body);

  res.status(201).json({ success: true, data: { skill: profile.skills[profile.skills.length - 1] } });
}

export async function updateSkill(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const id = req.params.id as string;
  const profile = await profileService.updateSkill(userId, id, req.body);

  if (!profile) {
    res.status(404).json({ success: false, error: { code: 'SKILL_NOT_FOUND', message: 'Skill not found.' } });
    return;
  }

  res.json({ success: true, data: { message: 'Skill updated' } });
}

export async function deleteSkill(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const id = req.params.id as string;
  await profileService.deleteSkill(userId, id);

  res.json({ success: true, data: { message: 'Skill deleted' } });
}

// ─── Experience ───────────────────────────────────────────────

export async function addExperience(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const profile = await profileService.addExperience(userId, req.body);

  res.status(201).json({
    success: true,
    data: { experience: profile.experience[profile.experience.length - 1] },
  });
}

export async function updateExperience(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const id = req.params.id as string;
  const profile = await profileService.updateExperience(userId, id, req.body);

  if (!profile) {
    res.status(404).json({ success: false, error: { code: 'EXPERIENCE_NOT_FOUND', message: 'Experience block not found.' } });
    return;
  }

  res.json({ success: true, data: { message: 'Experience updated' } });
}

export async function deleteExperience(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const id = req.params.id as string;
  await profileService.deleteExperience(userId, id);

  res.json({ success: true, data: { message: 'Experience deleted' } });
}

// ─── Projects ─────────────────────────────────────────────────

export async function addProject(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const profile = await profileService.addProject(userId, req.body);

  res.status(201).json({
    success: true,
    data: { project: profile.projects[profile.projects.length - 1] },
  });
}

export async function updateProject(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const id = req.params.id as string;
  const profile = await profileService.updateProject(userId, id, req.body);

  if (!profile) {
    res.status(404).json({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } });
    return;
  }

  res.json({ success: true, data: { message: 'Project updated' } });
}

export async function deleteProject(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const id = req.params.id as string;
  await profileService.deleteProject(userId, id);

  res.json({ success: true, data: { message: 'Project deleted' } });
}

/**
 * POST /api/v1/profile/upload — Upload PDF resume and auto-populate master profile.
 */
export async function uploadAndPopulateProfile(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  
  if (!req.file) {
    res.status(400).json({
      success: false,
      error: { code: 'NO_FILE_UPLOADED', message: 'No PDF file uploaded.' },
    });
    return;
  }

  try {
    const profile = await profileService.uploadAndPopulateProfile(userId, req.file);
    res.json({ success: true, data: { profile } });
  } catch (error) {
    console.error('Profile upload/parse error:', error);
    const code = (error as any).code || 'INTERNAL_ERROR';
    const status = (error as any).status || 500;
    res.status(status).json({
      success: false,
      error: {
        code,
        message: (error as any).message || 'Failed to parse resume and update profile.',
      },
    });
  }
}

// ─── Education ────────────────────────────────────────────────
export async function addEducation(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const profile = await profileService.addEducation(userId, req.body);
  res.status(201).json({
    success: true,
    data: { education: profile.education[profile.education.length - 1] },
  });
}

export async function updateEducation(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const id = req.params.id as string;
  const profile = await profileService.updateEducation(userId, id, req.body);

  if (!profile) {
    res.status(404).json({ success: false, error: { code: 'EDUCATION_NOT_FOUND', message: 'Education not found.' } });
    return;
  }
  res.json({ success: true, data: { message: 'Education updated' } });
}

export async function deleteEducation(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const id = req.params.id as string;
  await profileService.deleteEducation(userId, id);
  res.json({ success: true, data: { message: 'Education deleted' } });
}

// ─── Certifications ───────────────────────────────────────────
export async function addCertification(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const profile = await profileService.addCertification(userId, req.body);
  res.status(201).json({
    success: true,
    data: { certification: profile.certifications[profile.certifications.length - 1] },
  });
}

export async function updateCertification(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const id = req.params.id as string;
  const profile = await profileService.updateCertification(userId, id, req.body);

  if (!profile) {
    res.status(404).json({ success: false, error: { code: 'CERTIFICATION_NOT_FOUND', message: 'Certification not found.' } });
    return;
  }
  res.json({ success: true, data: { message: 'Certification updated' } });
}

export async function deleteCertification(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const id = req.params.id as string;
  await profileService.deleteCertification(userId, id);
  res.json({ success: true, data: { message: 'Certification deleted' } });
}
