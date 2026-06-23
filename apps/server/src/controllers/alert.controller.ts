import { Request, Response } from 'express';
import { Alert } from '../models/Alert.model.js';

/**
 * GET /api/v1/search/alerts — List all unread alerts for the logged-in user.
 */
export async function listAlerts(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  try {
    const alerts = await Alert.find({ userId, isRead: false })
      .populate('canonicalJobId')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    res.json({
      success: true,
      data: { alerts },
    });
  } catch (error) {
    console.error('List alerts error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'ALERTS_FETCH_FAILED', message: 'Failed to retrieve job alerts.' },
    });
  }
}

/**
 * PATCH /api/v1/search/alerts/:id/read — Mark a specific alert as read.
 */
export async function markAlertAsRead(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const alertId = req.params.id;

  try {
    const alert = await Alert.findOneAndUpdate(
      { _id: alertId, userId },
      { $set: { isRead: true } },
      { new: true }
    ).exec();

    if (!alert) {
      res.status(404).json({
        success: false,
        error: { code: 'ALERT_NOT_FOUND', message: 'Alert not found or access denied.' },
      });
      return;
    }

    res.json({
      success: true,
      data: { alert },
      message: 'Alert marked as read.',
    });
  } catch (error) {
    console.error('Mark alert read error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'ALERT_UPDATE_FAILED', message: 'Failed to mark alert as read.' },
    });
  }
}

/**
 * PATCH /api/v1/search/alerts/read-all — Mark all alerts as read for the logged-in user.
 */
export async function markAllAsRead(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  try {
    const result = await Alert.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } }
    ).exec();

    res.json({
      success: true,
      data: { modifiedCount: result.modifiedCount },
      message: 'All alerts marked as read.',
    });
  } catch (error) {
    console.error('Mark all alerts read error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'ALERTS_UPDATE_FAILED', message: 'Failed to mark all alerts as read.' },
    });
  }
}
