import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../middleware/validation.js';
import {
  ingestUrl,
  ingestPaste,
  searchJobs,
  createSavedSearch,
  listSavedSearches,
  listSources,
  createSource,
  cleanupJobs,
  updateSavedSearch,
  deleteSavedSearch,
} from '../controllers/search.controller.js';
import { listAlerts, markAlertAsRead } from '../controllers/alert.controller.js';

const router = Router();
router.use(authenticate);

// ─── Validation Schemas ────────────────────────────────────────
const ingestUrlSchema = z.object({
  url: z.string().url('A valid URL is required'),
});

const ingestPasteSchema = z.object({
  jobTitle: z.string().min(1, 'Job title is required'),
  companyName: z.string().min(1, 'Company name is required'),
  jdRawText: z.string().min(10, 'Job description must be at least 10 characters'),
  location: z.string().optional(),
  workType: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  employmentType: z.enum(['full-time', 'part-time', 'contract', 'internship']).optional(),
  salaryRange: z.object({ min: z.number(), max: z.number(), currency: z.string() }).optional(),
});

const searchJobsQuerySchema = z.object({
  q: z.string().trim().optional(),
  location: z.string().trim().optional(),
  workType: z.enum(['all', 'remote', 'hybrid', 'onsite']).default('all'),
  sourceId: z.string().optional(),
  sortBy: z.enum(['relevance', 'date']).default('relevance'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  freshnessDays: z.coerce.number().int().min(1).optional(),
  employmentType: z.string().optional(),
  salaryMin: z.coerce.number().int().min(0).optional(),
});

const createSavedSearchSchema = z.object({
  name: z.string().min(1, 'Saved search name is required'),
  query: z.string().optional(),
  filters: z.object({
    location: z.string().optional(),
    workType: z.enum(['remote', 'hybrid', 'onsite']).optional(),
    companyName: z.string().optional(),
  }).optional(),
  alertSubscription: z.object({
    emailEnabled: z.boolean(),
    inAppEnabled: z.boolean(),
  }).optional(),
});

const updateSavedSearchSchema = z.object({
  name: z.string().optional(),
  query: z.string().optional(),
  filters: z.object({
    location: z.string().optional(),
    workType: z.enum(['remote', 'hybrid', 'onsite']).optional(),
    companyName: z.string().optional(),
  }).optional(),
  alertSubscription: z.object({
    emailEnabled: z.boolean(),
    inAppEnabled: z.boolean(),
  }).optional(),
});

const createSourceSchema = z.object({
  name: z.string().min(1, 'Source name is required'),
  sourceType: z.enum(['manual_paste', 'public_job_page']),
  baseUrl: z.string().min(1, 'Base URL is required'),
  crawlFrequency: z.number().int().min(0).default(1440),
  extractionStrategy: z.enum(['html_metadata', 'json_ld', 'manual_input']),
  robotsPolicy: z.object({
    allowCrawl: z.boolean(),
    crawlDelay: z.number().optional(),
  }).optional(),
  trustScore: z.number().min(0).max(1).optional(),
});

const cleanupSchema = z.object({
  thresholdDays: z.number().int().min(0).optional(),
});

// ─── Routes ────────────────────────────────────────────────────
// Ingestion
router.post('/ingest/url', validateBody(ingestUrlSchema), ingestUrl);
router.post('/ingest/paste', validateBody(ingestPasteSchema), ingestPaste);

// Search Query
router.get('/', validateQuery(searchJobsQuerySchema), searchJobs);

// Saved Searches alerts management
router.post('/saved', validateBody(createSavedSearchSchema), createSavedSearch);
router.get('/saved', listSavedSearches);
router.patch('/saved/:id', validateBody(updateSavedSearchSchema), updateSavedSearch);
router.delete('/saved/:id', deleteSavedSearch);

// Alerts Inbox Delivery
router.get('/alerts', listAlerts);
router.patch('/alerts/:id/read', markAlertAsRead);

// Source Registry Config & Maintenance
router.post('/cleanup', validateBody(cleanupSchema), cleanupJobs);
router.get('/sources', listSources);
router.post('/sources', validateBody(createSourceSchema), createSource);

export default router;
