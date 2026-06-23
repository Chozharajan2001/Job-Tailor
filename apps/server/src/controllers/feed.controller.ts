import { Request, Response } from 'express';
import { FeedService } from '../services/feed.service.js';

/**
 * GET /api/v1/search/feed — Retrieve user's curated personalized feed.
 */
export async function getUserFeed(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  try {
    const result = await FeedService.getPersonalizedFeed(userId, page, limit);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Fetch user feed error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FEED_FETCH_FAILED', message: 'Failed to retrieve personalized feed.' },
    });
  }
}
