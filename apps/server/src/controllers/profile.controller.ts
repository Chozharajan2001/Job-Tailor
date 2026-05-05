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
  const { id } = req.params;
  const profile = await profileService.updateSkill(userId, id, req.body);

  if (!profile) {
    res.status(404).json({ success: false, error: { code: 'SKILL_NOT_FOUND', message: 'Skill not found.' } });
    return;
  }

  res.json({ success: true, data: { message: 'Skill updated' } });
}

export async function deleteSkill(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { id } = req.params;
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
  const { id } = req.params;
  const profile = await profileService.updateExperience(userId, id, req.body);

  if (!profile) {
    res.status(404).json({ success: false, error: { code: 'EXPERIENCE_NOT_FOUND', message: 'Experience block not found.' } });
    return;
  }

  res.json({ success: true, data: { message: 'Experience updated' } });
}

export async function deleteExperience(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { id } = req.params;
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
  const { id } = req.params;
  const profile = await profileService.updateProject(userId, id, req.body);

  if (!profile) {
    res.status(404).json({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } });
    return;
  }

  res.json({ success: true, data: { message: 'Project updated' } });
}

export async function deleteProject(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { id } = req.params;
  await profileService.deleteProject(userId, id);

  res.json({ success: true, data: { message: 'Project deleted' } });
}
