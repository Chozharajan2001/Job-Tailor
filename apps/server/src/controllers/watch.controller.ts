import { Request, Response } from 'express';
import { Watch } from '../models/Watch.model.js';

/**
 * POST /api/v1/search/watches — Create a new company/title watch.
 */
export async function createWatch(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { type, value } = req.body;

  try {
    // Check if watch already exists for this user to avoid unique index violation
    const existing = await Watch.findOne({ userId, type, value: value.trim() });
    if (existing) {
      res.status(400).json({
        success: false,
        error: { code: 'WATCH_EXISTS', message: 'You are already watching this keyword.' },
      });
      return;
    }

    const watch = await Watch.create({
      userId,
      type,
      value: value.trim(),
      isEnabled: true,
    });

    res.status(201).json({
      success: true,
      data: { watch },
    });
  } catch (error) {
    console.error('Create watch error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'WATCH_CREATE_FAILED', message: 'Failed to create watch keyword.' },
    });
  }
}

/**
 * GET /api/v1/search/watches — List all watches for the user.
 */
export async function listWatches(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  try {
    const watches = await Watch.find({ userId }).sort({ createdAt: -1 }).exec();

    res.json({
      success: true,
      data: { watches },
    });
  } catch (error) {
    console.error('List watches error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'WATCHES_FETCH_FAILED', message: 'Failed to retrieve watched keywords.' },
    });
  }
}

/**
 * PATCH /api/v1/search/watches/:id — Toggle enabled/disabled state of a watch.
 */
export async function toggleWatch(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const watchId = req.params.id;
  const { isEnabled } = req.body;

  try {
    const watch = await Watch.findOneAndUpdate(
      { _id: watchId, userId },
      { $set: { isEnabled } },
      { new: true }
    ).exec();

    if (!watch) {
      res.status(404).json({
        success: false,
        error: { code: 'WATCH_NOT_FOUND', message: 'Watch not found or access denied.' },
      });
      return;
    }

    res.json({
      success: true,
      data: { watch },
    });
  } catch (error) {
    console.error('Toggle watch error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'WATCH_UPDATE_FAILED', message: 'Failed to update watch status.' },
    });
  }
}

/**
 * DELETE /api/v1/search/watches/:id — Delete a watch.
 */
export async function deleteWatch(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const watchId = req.params.id;

  try {
    const result = await Watch.findOneAndDelete({ _id: watchId, userId }).exec();

    if (!result) {
      res.status(404).json({
        success: false,
        error: { code: 'WATCH_NOT_FOUND', message: 'Watch not found or access denied.' },
      });
      return;
    }

    res.json({
      success: true,
      data: { success: true },
      message: 'Watch deleted successfully.',
    });
  } catch (error) {
    console.error('Delete watch error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'WATCH_DELETE_FAILED', message: 'Failed to delete watched keyword.' },
    });
  }
}
