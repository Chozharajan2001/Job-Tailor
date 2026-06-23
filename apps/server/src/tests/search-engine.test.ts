import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { IngestionService } from '../services/ingestion.service.js';
import { DeduplicationService } from '../services/deduplication.service.js';
import { SearchService } from '../services/search.service.js';
import { SavedSearchService } from '../services/saved-search.service.js';
import { CleanupService } from '../services/cleanup.service.js';
import { CanonicalJob } from '../models/CanonicalJob.model.js';
import { SavedSearch } from '../models/SavedSearch.model.js';
import { SourceRegistry } from '../models/SourceRegistry.model.js';

// Switch configuration to safe test database
process.env.NODE_ENV = 'test';
if (process.env.MONGODB_URI) {
  process.env.MONGODB_URI = process.env.MONGODB_URI.replace('/job_tailor', '/job_tailor_test');
} else {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/job_tailor_test';
}

const mockJsonLdHtml = `
<html>
  <head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": "Staff Software Engineer",
        "hiringOrganization": {
          "name": "Google Inc"
        },
        "description": "We are looking for a Staff Software Engineer to design next-gen systems.",
        "jobLocation": {
          "address": {
            "addressLocality": "Mountain View",
            "addressRegion": "CA",
            "addressCountry": "US"
          }
        },
        "datePosted": "2026-06-20",
        "employmentType": "FULL_TIME",
        "url": "https://google.com/jobs/staff-eng-123"
      }
    </script>
  </head>
  <body>
    <h1>Staff Software Engineer</h1>
  </body>
</html>
`;

describe('Advanced Job Search Engine (Sprint 1) Integration Suite', () => {
  beforeAll(async () => {
    await connectDatabase();
    await CanonicalJob.deleteMany({});
    await SavedSearch.deleteMany({});
    await SourceRegistry.deleteMany({});
    await IngestionService.ensureDefaultSources();
  });

  afterAll(async () => {
    await CanonicalJob.deleteMany({});
    await SavedSearch.deleteMany({});
    await SourceRegistry.deleteMany({});
    await disconnectDatabase();
  });

  describe('1. Ingestion Pipeline & Contracts', () => {
    it('should successfully ingest manual copy-paste jobs and parse properties', async () => {
      const job = await IngestionService.ingestFromPaste({
        jobTitle: 'Senior Full Stack Engineer',
        companyName: 'Acme Corp',
        jdRawText: 'We are seeking a Senior Full Stack Engineer. Experience with React, Node, and TypeScript is required. Please apply today!',
        location: 'New York, NY',
        workType: 'hybrid',
        employmentType: 'full-time',
      });

      expect(job).toBeDefined();
      expect(job.jobTitle).toBe('Senior Full Stack Engineer');
      expect(job.companyName).toBe('Acme Corp');
      expect(job.location).toBe('New York, NY');
      expect(job.workType).toBe('hybrid');
      expect(job.employmentType).toBe('full-time');
      expect(job.isActive).toBe(true);
      expect(job.dedupeKey).toBe('acmecorp_seniorfullstackengineer_newyorkny');
    });

    it('should successfully fetch, parse JSON-LD, and ingest jobs from a URL', async () => {
      // Mock global fetch
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((): Promise<any> => {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(mockJsonLdHtml),
        });
      });

      const url = 'https://google.com/jobs/staff-eng-123';
      const job = await IngestionService.ingestFromUrl(url);

      expect(fetchSpy).toHaveBeenCalledWith(url, expect.any(Object));
      expect(job).toBeDefined();
      expect(job.jobTitle).toBe('Staff Software Engineer');
      expect(job.companyName).toBe('Google Inc');
      expect(job.location).toBe('Mountain View, CA, US');
      expect(job.applyUrl).toBe('https://google.com/jobs/staff-eng-123');
      expect(job.sourceUrl).toBe(url);
      expect(job.isActive).toBe(true);

      fetchSpy.mockRestore();
    });
  });

  describe('2. Deduplication Layer', () => {
    it('should deduplicate exact URL imports (L1)', async () => {
      // Clear before test
      await CanonicalJob.deleteMany({});

      // First ingest
      const job1 = await IngestionService.ingestFromPaste({
        jobTitle: 'DevOps Engineer',
        companyName: 'Cloud Systems',
        jdRawText: 'We are hiring a DevOps Engineer. Experience with AWS and Terraform is required.',
        location: 'Seattle, WA',
      });

      // Manually set applyUrl
      job1.applyUrl = 'https://cloudsystems.com/jobs/devops';
      await job1.save();

      // Second ingest with same URL
      const input = {
        sourceType: 'public_job_page' as const,
        sourceName: 'Manual Ingest',
        applyUrl: 'https://cloudsystems.com/jobs/devops',
        companyName: 'Cloud Systems V2', // different company but same URL
        jobTitle: 'Lead DevOps Engineer', // different title but same URL
        description: 'New DevOps description',
      };

      const job2 = await IngestionService.ingestJob(input);

      // Verify they returned the exact same document ID
      expect(job2._id.toString()).toBe(job1._id.toString());
      expect(job2.lastSeenAt.getTime()).toBeGreaterThanOrEqual(job1.lastSeenAt.getTime());
    });

    it('should deduplicate exact normalized title/company/location combinations (L2)', async () => {
      await CanonicalJob.deleteMany({});

      const job1 = await IngestionService.ingestFromPaste({
        jobTitle: 'Backend Developer',
        companyName: 'Tech Corp',
        jdRawText: 'Backend developer role. Tech stack: Go, PostgreSQL, Redis.',
        location: 'Remote',
      });

      // Ingest same title, company, location with different spaces and cases
      const job2 = await IngestionService.ingestFromPaste({
        jobTitle: '  BACKEND developer  ',
        companyName: 'tech CORP',
        jdRawText: 'Backend developer role. Tech stack: Go, PostgreSQL, Redis.',
        location: 'remote',
      });

      expect(job2._id.toString()).toBe(job1._id.toString());
    });

    it('should deduplicate by description text hash similarity (L3)', async () => {
      await CanonicalJob.deleteMany({});

      const desc = 'We are hiring a Python Engineer for data scraping. Pandas, BeautifulSoup, Selenium experience needed.';
      
      const job1 = await IngestionService.ingestFromPaste({
        jobTitle: 'Python Web Scraper',
        companyName: 'Data Miner Inc',
        jdRawText: desc,
        location: 'Austin, TX',
      });

      // Different title/company/location but identical description hash
      const job2 = await IngestionService.ingestFromPaste({
        jobTitle: 'Scrapy Specialist',
        companyName: 'Miner Systems',
        jdRawText: desc,
        location: 'San Francisco, CA',
      });

      expect(job2._id.toString()).toBe(job1._id.toString());
    });
  });

  describe('3. Global Search & Ranking', () => {
    beforeAll(async () => {
      await CanonicalJob.deleteMany({});
      
      // Ingest search items with controlled parameters for ranking proof
      // 1. Google Tech Lead (high title match)
      await IngestionService.ingestFromPaste({
        jobTitle: 'Tech Lead',
        companyName: 'Google',
        jdRawText: 'Looking for a Lead Engineer / Tech Lead with expertise in systems design.',
        location: 'Remote',
      });

      // 2. Microsoft Software Engineer (medium match)
      await IngestionService.ingestFromPaste({
        jobTitle: 'Software Engineer',
        companyName: 'Microsoft',
        jdRawText: 'We need a Software Engineer. Coding in C# and TypeScript.',
        location: 'Seattle, WA',
      });

      // 3. Apple iOS Dev
      await IngestionService.ingestFromPaste({
        jobTitle: 'iOS Developer',
        companyName: 'Apple',
        jdRawText: 'Build the next version of iOS apps. Swift, SwiftUI.',
        location: 'Cupertino, CA',
      });
    });

    it('should search jobs by query string and filter by location/workType', async () => {
      // Search with keyword
      const result1 = await SearchService.searchJobs({ q: 'Tech Lead' });
      expect(result1.jobs.length).toBeGreaterThan(0);
      expect(result1.jobs[0].jobTitle).toBe('Tech Lead');

      // Search with location filter
      const result2 = await SearchService.searchJobs({ location: 'Seattle' });
      expect(result2.jobs.length).toBe(1);
      expect(result2.jobs[0].companyName).toBe('Microsoft');
    });

    it('should rank exact title matches higher than standard descriptions', async () => {
      const result = await SearchService.searchJobs({ q: 'iOS Developer' });
      expect(result.jobs[0].jobTitle).toBe('iOS Developer');
      expect(result.jobs[0].companyName).toBe('Apple');
    });
  });

  describe('4. Saved Searches CRUD', () => {
    it('should create and retrieve saved search alert configurations', async () => {
      const mockUserId = new mongoose.Types.ObjectId().toString();

      const saved = await SavedSearchService.createSavedSearch(mockUserId, {
        name: 'Remote React Jobs',
        query: 'React Engineer',
        filters: { workType: 'remote' },
        alertSubscription: { emailEnabled: true, inAppEnabled: true },
      });

      expect(saved).toBeDefined();
      expect(saved.name).toBe('Remote React Jobs');
      expect(saved.query).toBe('React Engineer');
      expect(saved.filters.workType).toBe('remote');

      const list = await SavedSearchService.listSavedSearches(mockUserId);
      expect(list.length).toBe(1);
      expect(list[0].name).toBe('Remote React Jobs');
    });
  });

  describe('5. Stale Job Cleanup Job', () => {
    it('should mark stale canonical jobs inactive and exclude them from search results', async () => {
      await CanonicalJob.deleteMany({});

      // Ingest active job
      const activeJob = await IngestionService.ingestFromPaste({
        jobTitle: 'Active Rails Developer',
        companyName: 'Fast Tech',
        jdRawText: 'Ruby on Rails and Postgres application developer job description.',
        location: 'Remote',
      });

      // Ingest stale job
      const staleJob = await IngestionService.ingestFromPaste({
        jobTitle: 'Old PHP Developer',
        companyName: 'Legacy Systems',
        jdRawText: 'Maintenance of legacy PHP 5 backend servers and databases.',
        location: 'Boston, MA',
      });

      // Artificially age the stale job
      staleJob.lastSeenAt = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000); // 35 days ago
      await staleJob.save();

      // Verify both are active initially
      expect(activeJob.isActive).toBe(true);
      expect(staleJob.isActive).toBe(true);

      // Run cleanup (30 days threshold)
      const count = await CleanupService.cleanupStaleJobs(30);
      expect(count).toBe(1);

      // Reload jobs
      const loadedActive = await CanonicalJob.findById(activeJob._id);
      const loadedStale = await CanonicalJob.findById(staleJob._id);

      expect(loadedActive?.isActive).toBe(true);
      expect(loadedStale?.isActive).toBe(false);
      expect(loadedStale?.expiredAt).toBeDefined();

      // Search and verify stale jobs are excluded by default
      const searchRes = await SearchService.searchJobs({ q: 'PHP' });
      expect(searchRes.jobs.length).toBe(0);
    });
  });
});
