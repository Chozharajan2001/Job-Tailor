import { Request, Response } from 'express';
import { IngestionService } from '../services/ingestion.service.js';
import { SearchService } from '../services/search.service.js';
import { SavedSearchService } from '../services/saved-search.service.js';
import { CleanupService } from '../services/cleanup.service.js';
import { SourceRegistry } from '../models/SourceRegistry.model.js';

/**
 * POST /api/v1/search/ingest/url — Ingest job details from a public URL.
 */
export async function ingestUrl(req: Request, res: Response): Promise<void> {
  const { url } = req.body;
  if (!url) {
    res.status(400).json({ success: false, error: { code: 'MISSING_URL', message: 'URL is required.' } });
    return;
  }

  try {
    const job = await IngestionService.ingestFromUrl(url);
    res.status(201).json({
      success: true,
      data: { job },
      message: 'Job ingested successfully.',
    });
  } catch (error) {
    console.error('Ingest URL error:', error);
    const msg = error instanceof Error ? error.message : 'Ingestion failed';
    res.status(500).json({
      success: false,
      error: { code: 'INGESTION_FAILED', message: msg },
    });
  }
}

/**
 * POST /api/v1/search/ingest/paste — Ingest job details from pasted text.
 */
export async function ingestPaste(req: Request, res: Response): Promise<void> {
  const { jobTitle, companyName, jdRawText, location, workType, employmentType, salaryRange } = req.body;
  if (!jobTitle || !companyName || !jdRawText) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_FAILED', message: 'title, company, and raw text are required.' },
    });
    return;
  }

  try {
    const job = await IngestionService.ingestFromPaste({
      jobTitle,
      companyName,
      jdRawText,
      location,
      workType,
      employmentType,
      salaryRange,
    });
    res.status(201).json({
      success: true,
      data: { job },
      message: 'Job pasted & processed successfully.',
    });
  } catch (error) {
    console.error('Ingest paste error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INGESTION_FAILED', message: 'Failed to process pasted job description.' },
    });
  }
}

/**
 * GET /api/v1/search — Search the canonical jobs collection.
 */
export async function searchJobs(req: Request, res: Response): Promise<void> {
  const q = (req.query.q as string)?.trim();
  const location = (req.query.location as string)?.trim();
  const workType = req.query.workType as any;
  const sourceId = req.query.sourceId as string;
  const sortBy = req.query.sortBy as any; // 'relevance' | 'date'
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const freshnessDays = req.query.freshnessDays ? parseInt(req.query.freshnessDays as string) : undefined;

  try {
    const result = await SearchService.searchJobs({
      q,
      location,
      workType,
      sourceId,
      sortBy,
      page,
      limit,
      freshnessDays,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Search jobs error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SEARCH_FAILED', message: 'Failed to complete search query.' },
    });
  }
}

/**
 * POST /api/v1/search/saved — Save a search query and filters.
 */
export async function createSavedSearch(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { name, query, filters, alertSubscription } = req.body;

  if (!name) {
    res.status(400).json({ success: false, error: { code: 'MISSING_NAME', message: 'Saved search name is required.' } });
    return;
  }

  try {
    const saved = await SavedSearchService.createSavedSearch(userId, {
      name,
      query,
      filters,
      alertSubscription,
    });

    res.status(201).json({
      success: true,
      data: { savedSearch: saved },
      message: 'Search criteria saved.',
    });
  } catch (error) {
    console.error('Create saved search error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SAVED_SEARCH_FAILED', message: 'Failed to save search.' },
    });
  }
}

/**
 * GET /api/v1/search/saved — List the user's saved searches.
 */
export async function listSavedSearches(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  try {
    const savedSearches = await SavedSearchService.listSavedSearches(userId);
    res.json({ success: true, data: { savedSearches } });
  } catch (error) {
    console.error('List saved searches error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SAVED_SEARCH_LIST_FAILED', message: 'Failed to retrieve saved searches.' },
    });
  }
}

/**
 * POST /api/v1/search/cleanup — Run the stale-job deactivation maintenance task.
 */
export async function cleanupJobs(req: Request, res: Response): Promise<void> {
  const thresholdDays = req.body.thresholdDays !== undefined ? parseInt(req.body.thresholdDays) : 30;

  try {
    const deactivatedCount = await CleanupService.cleanupStaleJobs(thresholdDays);
    res.json({
      success: true,
      data: { deactivatedCount },
      message: 'Stale jobs cleaned up successfully.',
    });
  } catch (error) {
    console.error('Cleanup jobs error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'CLEANUP_FAILED', message: 'Failed to run stale jobs cleanup.' },
    });
  }
}

/**
 * GET /api/v1/search/sources — List available search sources.
 */
export async function listSources(req: Request, res: Response): Promise<void> {
  try {
    await IngestionService.ensureDefaultSources();
    const sources = await SourceRegistry.find({ isEnabled: true }).sort({ name: 1 }).lean().exec();
    res.json({ success: true, data: { sources } });
  } catch (error) {
    console.error('List sources error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'LIST_SOURCES_FAILED', message: 'Failed to retrieve sources.' },
    });
  }
}

/**
 * POST /api/v1/search/sources — Create a new source config.
 */
export async function createSource(req: Request, res: Response): Promise<void> {
  const { name, sourceType, baseUrl, crawlFrequency, extractionStrategy, robotsPolicy, trustScore } = req.body;

  if (!name || !sourceType || !baseUrl || !extractionStrategy) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_FAILED', message: 'name, sourceType, baseUrl, and extractionStrategy are required.' },
    });
    return;
  }

  try {
    const source = await SourceRegistry.create({
      name,
      sourceType,
      baseUrl,
      crawlFrequency: crawlFrequency || 1440,
      extractionStrategy,
      robotsPolicy,
      trustScore: trustScore !== undefined ? trustScore : 0.5,
      isEnabled: true,
    });

    res.status(201).json({
      success: true,
      data: { source },
      message: 'Job source registered successfully.',
    });
  } catch (error) {
    console.error('Create source error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'CREATE_SOURCE_FAILED', message: 'Failed to register job source.' },
    });
  }
}
