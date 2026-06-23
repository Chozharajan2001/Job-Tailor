import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { IngestionService } from '../services/ingestion.service.js';
import { DeduplicationService } from '../services/deduplication.service.js';
import { SearchService } from '../services/search.service.js';
import { SavedSearchService } from '../services/saved-search.service.js';
import { CleanupService } from '../services/cleanup.service.js';
import { AlertDispatcherService } from '../services/alert-dispatcher.service.js';
import { CanonicalJob } from '../models/CanonicalJob.model.js';
import { SavedSearch } from '../models/SavedSearch.model.js';
import { SourceRegistry } from '../models/SourceRegistry.model.js';
import { Profile } from '../models/Profile.model.js';
import { Alert } from '../models/Alert.model.js';

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

describe('Advanced Job Search Engine (Sprint 2) Integration Suite', () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();

  beforeAll(async () => {
    await connectDatabase();
    await CanonicalJob.deleteMany({});
    await SavedSearch.deleteMany({});
    await SourceRegistry.deleteMany({});
    await Profile.deleteMany({});
    await Alert.deleteMany({});
    await IngestionService.ensureDefaultSources();

    // Create a mock profile for skill boost scoring tests
    await Profile.create({
      userId: new mongoose.Types.ObjectId(mockUserId),
      summary: 'A senior developer profile',
      skills: [
        { name: 'React', category: 'frontend', yearsOfExperience: 3, proficiency: 'advanced', isHighlighted: true },
        { name: 'TypeScript', category: 'frontend', yearsOfExperience: 2, proficiency: 'intermediate', isHighlighted: false },
      ],
      experience: [],
      projects: [],
      education: [],
      certifications: [],
    });
  });

  afterAll(async () => {
    await CanonicalJob.deleteMany({});
    await SavedSearch.deleteMany({});
    await SourceRegistry.deleteMany({});
    await Profile.deleteMany({});
    await Alert.deleteMany({});
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
        companyName: 'Cloud Systems V2',
        jobTitle: 'Lead DevOps Engineer',
        description: 'New DevOps description',
      };

      const job2 = await IngestionService.ingestJob(input);

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

      const job2 = await IngestionService.ingestFromPaste({
        jobTitle: 'Scrapy Specialist',
        companyName: 'Miner Systems',
        jdRawText: desc,
        location: 'San Francisco, CA',
      });

      expect(job2._id.toString()).toBe(job1._id.toString());
    });
  });

  describe('3. Global Search & Relevance Ranking (Sprint 2)', () => {
    beforeAll(async () => {
      await CanonicalJob.deleteMany({});
      
      // 1. Ingest TypeScript Job (for synonym mapping tests)
      await IngestionService.ingestFromPaste({
        jobTitle: 'Frontend Lead',
        companyName: 'Aero Systems',
        jdRawText: 'Build UI apps. Requires deep knowledge of TypeScript and CSS.',
        location: 'Remote',
      });

      // 2. Ingest React Job (matches profile skill "React")
      await IngestionService.ingestFromPaste({
        jobTitle: 'UI Engineer',
        companyName: 'Hype Technologies',
        jdRawText: 'Build products using React.',
        location: 'Remote',
      });

      // 3. Ingest Node Job (no match to React/TypeScript profile skills)
      await IngestionService.ingestFromPaste({
        jobTitle: 'Backend Engineer',
        companyName: 'Hype Technologies',
        jdRawText: 'Build APIs using Ruby on Rails.',
        location: 'Seattle, WA',
      });
    });

    it('should match jobs using tech synonym expansion (e.g. TS matches TypeScript)', async () => {
      const searchRes = await SearchService.searchJobs({ q: 'TS' });
      expect(searchRes.jobs.length).toBeGreaterThan(0);
      expect(searchRes.jobs[0].jobTitle).toBe('Frontend Lead');
    });

    it('should boost relevance score for jobs matching profile skills (personalization)', async () => {
      const searchRes = await SearchService.searchJobs({ q: 'Engineer', userId: mockUserId });
      
      const reactJob = searchRes.jobs.find(j => j.companyName === 'Hype Technologies' && j.jobTitle === 'UI Engineer');
      const railsJob = searchRes.jobs.find(j => j.companyName === 'Hype Technologies' && j.jobTitle === 'Backend Engineer');

      expect(reactJob).toBeDefined();
      expect(railsJob).toBeDefined();
      // reactJob matches user profile skill "React", giving it a personalized score boost
      expect(reactJob.relevanceScore).toBeGreaterThan(railsJob.relevanceScore);
      expect(reactJob.skillsMatchedCount).toBe(1);
    });

    it('should filter search results independently using advanced filters', async () => {
      // Filter by location
      const result1 = await SearchService.searchJobs({ location: 'Seattle' });
      expect(result1.jobs.length).toBe(1);
      expect(result1.jobs[0].jobTitle).toBe('Backend Engineer');

      // Filter by employment type
      const result2 = await SearchService.searchJobs({ employmentType: 'full-time' });
      expect(result2.jobs.length).toBeGreaterThan(0);
    });
  });

  describe('4. Saved Searches CRUD & Alerts Dispatch', () => {
    it('should create, update, delete, and list saved search filters', async () => {
      const saved = await SavedSearchService.createSavedSearch(mockUserId, {
        name: 'Remote JS Jobs',
        query: 'JS Developer',
        filters: { workType: 'remote' },
        alertSubscription: { emailEnabled: false, inAppEnabled: true },
      });

      expect(saved).toBeDefined();
      expect(saved.name).toBe('Remote JS Jobs');

      // Update name & settings
      const updated = await SavedSearchService.updateSavedSearch(mockUserId, saved._id.toString(), {
        name: 'Remote JavaScript Jobs',
        alertSubscription: { emailEnabled: true, inAppEnabled: true },
      });
      expect(updated?.name).toBe('Remote JavaScript Jobs');

      const list = await SavedSearchService.listSavedSearches(mockUserId);
      expect(list.length).toBe(1);

      const deleted = await SavedSearchService.deleteSavedSearch(mockUserId, saved._id.toString());
      expect(deleted).toBe(true);
    });

    it('should generate an Alert when a newly ingested job matches a SavedSearch', async () => {
      await SavedSearch.deleteMany({});
      await Alert.deleteMany({});

      // Create saved search alert rule
      const rule = await SavedSearchService.createSavedSearch(mockUserId, {
        name: 'Rust Alerts',
        query: 'Rust',
        filters: { workType: 'remote' },
        alertSubscription: { emailEnabled: false, inAppEnabled: true },
      });

      // 1. Ingest a non-matching job
      await IngestionService.ingestFromPaste({
        jobTitle: 'Golang developer',
        companyName: 'Cloud Inc',
        jdRawText: 'Build cloud servers with Go.',
        location: 'Remote',
        workType: 'remote',
      });

      const alertsAfterNonMatch = await Alert.find({ userId: mockUserId }).exec();
      expect(alertsAfterNonMatch.length).toBe(0);

      // 2. Ingest matching job
      const matchingJob = await IngestionService.ingestFromPaste({
        jobTitle: 'Rust Engineer',
        companyName: 'Web3 Inc',
        jdRawText: 'Write safe high-performance logic with Rust.',
        location: 'Remote',
        workType: 'remote',
      });

      // Await short timeout for background async alert dispatch
      await new Promise((resolve) => setTimeout(resolve, 100));
 
      const alertsAfterMatch = await Alert.find({ userId: mockUserId }).exec();
      expect(alertsAfterMatch.length).toBe(1);
      expect(alertsAfterMatch[0].canonicalJobId.toString()).toBe(matchingJob._id.toString());
    });
  });

  describe('5. Stale Job Cleanup Job', () => {
    it('should mark stale canonical jobs inactive and exclude them from search results', async () => {
      await CanonicalJob.deleteMany({});

      const activeJob = await IngestionService.ingestFromPaste({
        jobTitle: 'Active Rails Developer',
        companyName: 'Fast Tech',
        jdRawText: 'Ruby on Rails and Postgres application developer job description.',
        location: 'Remote',
      });

      const staleJob = await IngestionService.ingestFromPaste({
        jobTitle: 'Old PHP Developer',
        companyName: 'Legacy Systems',
        jdRawText: 'Maintenance of legacy PHP 5 backend servers and databases.',
        location: 'Boston, MA',
      });

      staleJob.lastSeenAt = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000); // 35 days ago
      await staleJob.save();

      const count = await CleanupService.cleanupStaleJobs(30);
      expect(count).toBe(1);

      const loadedStale = await CanonicalJob.findById(staleJob._id);
      expect(loadedStale?.isActive).toBe(false);

      const searchRes = await SearchService.searchJobs({ q: 'PHP' });
      expect(searchRes.jobs.length).toBe(0);
    });
  });
});
