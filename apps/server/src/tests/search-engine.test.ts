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
import { Watch } from '../models/Watch.model.js';
import { SearchQueryLog } from '../models/SearchQueryLog.model.js';
import { JobInteractionLog } from '../models/JobInteractionLog.model.js';

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
    await Watch.deleteMany({});
    await SearchQueryLog.deleteMany({});
    await JobInteractionLog.deleteMany({});
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
    await Watch.deleteMany({});
    await SearchQueryLog.deleteMany({});
    await JobInteractionLog.deleteMany({});
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

    it('should throw an error when URL fetch fails (HTTP status >= 400)', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((): Promise<any> => {
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });
      });

      const url = 'https://google.com/jobs/invalid-url';
      await expect(IngestionService.ingestFromUrl(url)).rejects.toThrow(
        'Failed to fetch job URL: Not Found (404)'
      );

      fetchSpy.mockRestore();
    });

    it('should throw an error when minimum job details cannot be parsed', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((): Promise<any> => {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('<html><body>Empty page</body></html>'),
        });
      });

      const url = 'https://google.com/jobs/empty-page';
      await expect(IngestionService.ingestFromUrl(url)).rejects.toThrow(
        'Failed to extract minimum job details (title, company, description) from URL.'
      );

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
      await new Promise((resolve) => setTimeout(resolve, 300));
 
      const alertsAfterMatch = await Alert.find({ userId: mockUserId }).exec();
      expect(alertsAfterMatch.length).toBe(1);
      expect(alertsAfterMatch[0].canonicalJobId.toString()).toBe(matchingJob._id.toString());
    });

    it('should list alerts and mark an alert as read via controller functions', async () => {
      await Alert.deleteMany({});
      const alert = await Alert.create({
        userId: new mongoose.Types.ObjectId(mockUserId),
        savedSearchId: new mongoose.Types.ObjectId(),
        canonicalJobId: new mongoose.Types.ObjectId(),
        isRead: false,
      });

      const reqList = { user: { userId: mockUserId } } as any;
      let responseData: any = null;
      const resList = {
        json: (data: any) => {
          responseData = data;
        },
        status: (code: number) => resList,
      } as any;

      const { listAlerts, markAlertAsRead } = await import('../controllers/alert.controller.js');
      await listAlerts(reqList, resList);

      expect(responseData).toBeDefined();
      expect(responseData.success).toBe(true);
      expect(responseData.data.alerts.length).toBe(1);

      const reqRead = { user: { userId: mockUserId }, params: { id: alert._id.toString() } } as any;
      let readResponseData: any = null;
      const resRead = {
        json: (data: any) => {
          readResponseData = data;
        },
        status: (code: number) => resRead,
      } as any;

      await markAlertAsRead(reqRead, resRead);
      expect(readResponseData).toBeDefined();
      expect(readResponseData.success).toBe(true);
      expect(readResponseData.data.alert.isRead).toBe(true);

      const updatedAlert = await Alert.findById(alert._id);
      expect(updatedAlert?.isRead).toBe(true);
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

  describe('6. Watches, Curated Feeds & Link Verification (Sprint 3)', () => {
    it('should support Watch CRUD and trigger alerts for matching watches on ingestion', async () => {
      await Watch.deleteMany({});
      await Alert.deleteMany({});

      // 1. Create a watch
      const companyWatch = await Watch.create({
        userId: new mongoose.Types.ObjectId(mockUserId),
        type: 'company',
        value: 'Netflix',
        isEnabled: true,
      });

      expect(companyWatch).toBeDefined();
      expect(companyWatch.type).toBe('company');
      expect(companyWatch.value).toBe('Netflix');

      // 2. Ingest matching job
      const matchingJob = await IngestionService.ingestFromPaste({
        jobTitle: 'Senior UI Developer',
        companyName: 'Netflix Inc',
        jdRawText: 'Build UI for Netflix streaming apps using React.',
        location: 'Los Gatos, CA',
      });

      // Wait for async alert dispatch
      await new Promise((resolve) => setTimeout(resolve, 300));

      const alerts = await Alert.find({ userId: mockUserId }).exec();
      expect(alerts.length).toBe(1);
      expect(alerts[0].watchId?.toString()).toBe(companyWatch._id.toString());
      expect(alerts[0].canonicalJobId.toString()).toBe(matchingJob._id.toString());

      // 3. Disable watch, ingest another and verify no new alert
      companyWatch.isEnabled = false;
      await companyWatch.save();

      await IngestionService.ingestFromPaste({
        jobTitle: 'Staff Backend Engineer',
        companyName: 'Netflix Inc',
        jdRawText: 'Build high-performance streaming backend services.',
        location: 'Los Gatos, CA',
      });

      await new Promise((resolve) => setTimeout(resolve, 300));
      const alertsAfterDisable = await Alert.find({ userId: mockUserId }).exec();
      expect(alertsAfterDisable.length).toBe(1);
    });

    it('should generate curated feeds and exclude imported jobs', async () => {
      await CanonicalJob.deleteMany({});
      await Watch.deleteMany({});
      await Alert.deleteMany({});
      const { Job } = await import('../models/Job.model.js');
      await Job.deleteMany({});

      // Create a watch for title "Staff"
      await Watch.create({
        userId: new mongoose.Types.ObjectId(mockUserId),
        type: 'title',
        value: 'Staff',
        isEnabled: true,
      });

      // Ingest Job A (matches watch title "Staff")
      const jobA = await IngestionService.ingestFromPaste({
        jobTitle: 'Staff Engineer',
        companyName: 'Linear',
        jdRawText: 'Build linear products.',
        location: 'Remote',
      });

      // Ingest Job B (matches profile skill "React")
      const jobB = await IngestionService.ingestFromPaste({
        jobTitle: 'UI Specialist',
        companyName: 'Vercel',
        jdRawText: 'Build frontend pages using React framework.',
        location: 'Remote',
      });

      // Ingest Job C (matches neither watch nor profile skill)
      await IngestionService.ingestFromPaste({
        jobTitle: 'C++ Systems Programmer',
        companyName: 'Intel',
        jdRawText: 'Optimizing compiler backend pipelines.',
        location: 'Santa Clara, CA',
      });

      const { FeedService } = await import('../services/feed.service.js');
      const feedResult = await FeedService.getPersonalizedFeed(mockUserId);
      expect(feedResult.feed.length).toBeGreaterThan(0);

      // Staff (Job A) has watch boost (150+freshness+trust), should rank first
      expect(feedResult.feed[0].jobTitle).toBe('Staff Engineer');

      // Import Job B to tracker
      await Job.create({
        userId: new mongoose.Types.ObjectId(mockUserId),
        companyName: 'Vercel',
        jobTitle: 'UI Specialist',
        jobLink: jobB.applyUrl || jobB.sourceUrl || 'https://vercel.com',
        location: 'Remote',
        jdRawText: 'Frontend React desc',
        status: 'saved',
      });

      // Fetch feed again, Job B should be excluded
      const feedResultAfterImport = await FeedService.getPersonalizedFeed(mockUserId);
      const containsVercel = feedResultAfterImport.feed.some(item => item.companyName === 'Vercel');
      expect(containsVercel).toBe(false);
    });

    it('should support batch read mark-all-read behavior', async () => {
      await Alert.deleteMany({});
      await Alert.create([
        { userId: mockUserId, canonicalJobId: new mongoose.Types.ObjectId(), isRead: false },
        { userId: mockUserId, canonicalJobId: new mongoose.Types.ObjectId(), isRead: false },
      ]);

      const req = { user: { userId: mockUserId } } as any;
      let responseData: any = null;
      const res = {
        json: (data: any) => {
          responseData = data;
        },
        status: (code: number) => res,
      } as any;

      const { markAllAsRead } = await import('../controllers/alert.controller.js');
      await markAllAsRead(req, res);

      expect(responseData.success).toBe(true);
      const unread = await Alert.countDocuments({ userId: mockUserId, isRead: false });
      expect(unread).toBe(0);
    });
  });

  describe('7. Ingestion Quality, Trust Decay & Search Analytics (Sprint 4)', () => {
    it('should support verificationState defaults and update states on link checks', async () => {
      await CanonicalJob.deleteMany({});
      await SourceRegistry.deleteMany({});

      const source = await SourceRegistry.create({
        name: 'Ping Source',
        sourceType: 'public_job_page',
        baseUrl: 'https://example-test-source.com',
        crawlFrequency: 1440,
        extractionStrategy: 'json_ld',
        trustScore: 0.8,
        isEnabled: true,
      });

      const job = await CanonicalJob.create({
        sourceId: source._id,
        sourceName: source.name,
        companyName: 'Example Inc',
        jobTitle: 'Example Engineer',
        location: 'Remote',
        workType: 'remote',
        description: 'Mock job description.',
        applyUrl: 'https://example-test-source.com/jobs/404-check',
        dedupeKey: 'example_404_key',
        isActive: true,
      });

      job.lastSeenAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      await job.save();

      expect(job.verificationState).toBe('unverified');

      // Mock global fetch returning 404
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((): Promise<any> => {
        return Promise.resolve({
          status: 404,
          url: 'https://example-test-source.com/jobs/404-check',
        });
      });

      // Run cleanup URL checks
      const count = await CleanupService.cleanupStaleJobs(30);
      expect(count).toBe(1);

      const updatedJob = await CanonicalJob.findById(job._id);
      expect(updatedJob?.isActive).toBe(false);
      expect(updatedJob?.verificationState).toBe('failed');
      expect(updatedJob?.verificationError).toBe('HTTP 404');

      // Verify source trust score decreased (0.8 -> 0.75)
      const updatedSource = await SourceRegistry.findById(source._id);
      expect(updatedSource?.trustScore).toBeLessThan(0.8);
      expect(updatedSource?.trustScore).toBe(0.75);

      fetchSpy.mockRestore();
    });

    it('should log user click interactions and handle flagging feedback to update states/trust', async () => {
      await CanonicalJob.deleteMany({});
      await SourceRegistry.deleteMany({});
      await JobInteractionLog.deleteMany({});

      const source = await SourceRegistry.create({
        name: 'Feedback Source',
        sourceType: 'public_job_page',
        baseUrl: 'https://feedback-test.com',
        crawlFrequency: 1440,
        extractionStrategy: 'json_ld',
        trustScore: 0.9,
        isEnabled: true,
      });

      const job = await CanonicalJob.create({
        sourceId: source._id,
        sourceName: source.name,
        companyName: 'Feedback Inc',
        jobTitle: 'Feedback Engineer',
        location: 'Remote',
        workType: 'remote',
        description: 'Mock feedback job.',
        applyUrl: 'https://feedback-test.com/jobs/1',
        dedupeKey: 'feedback_key',
        isActive: true,
      });

      const { AnalyticsService } = await import('../services/analytics.service.js');

      // 1. Log a details click
      await AnalyticsService.logInteraction(mockUserId, job._id.toString(), 'click');
      const clickLogs = await JobInteractionLog.find({ interactionType: 'click' });
      expect(clickLogs.length).toBe(1);
      expect(clickLogs[0].canonicalJobId.toString()).toBe(job._id.toString());

      // 2. Submit a spam flag
      await AnalyticsService.logInteraction(mockUserId, job._id.toString(), 'flag_spam', 'This is scam spam');
      const spamLogs = await JobInteractionLog.find({ interactionType: 'flag_spam' });
      expect(spamLogs.length).toBe(1);

      const updatedJob = await CanonicalJob.findById(job._id);
      expect(updatedJob?.verificationState).toBe('suspicious');
      expect(updatedJob?.isActive).toBe(false);

      // Verify trust score decayed by 0.10 (0.9 -> 0.8)
      const updatedSource = await SourceRegistry.findById(source._id);
      expect(updatedSource?.trustScore).toBe(0.8);
    });

    it('should exclude failed and suspicious jobs from search and feeds', async () => {
      await CanonicalJob.deleteMany({});

      // Create a verified job
      await CanonicalJob.create({
        sourceName: 'Search Source',
        companyName: 'Good Company',
        jobTitle: 'React Developer',
        location: 'Remote',
        workType: 'remote',
        description: 'React developer job description.',
        dedupeKey: 'good_react_key',
        isActive: true,
        verificationState: 'verified',
      });

      // Create a failed job
      await CanonicalJob.create({
        sourceName: 'Search Source',
        companyName: 'Bad Company',
        jobTitle: 'React Engineer',
        location: 'Remote',
        workType: 'remote',
        description: 'React engineer job description.',
        dedupeKey: 'bad_react_key',
        isActive: true,
        verificationState: 'failed',
      });

      // Create a suspicious job
      await CanonicalJob.create({
        sourceName: 'Search Source',
        companyName: 'Spam Company',
        jobTitle: 'React Specialist',
        location: 'Remote',
        workType: 'remote',
        description: 'React specialist job description.',
        dedupeKey: 'spam_react_key',
        isActive: true,
        verificationState: 'suspicious',
      });

      const searchRes = await SearchService.searchJobs({ q: 'React' });
      expect(searchRes.jobs.length).toBe(1);
      expect(searchRes.jobs[0].companyName).toBe('Good Company');

      // Verify personalized feed also excludes them
      const { FeedService } = await import('../services/feed.service.js');
      const feedRes = await FeedService.getPersonalizedFeed(mockUserId);
      const feedNames = feedRes.feed.map(j => j.companyName);
      expect(feedNames).toContain('Good Company');
      expect(feedNames).not.toContain('Bad Company');
      expect(feedNames).not.toContain('Spam Company');
    });

    it('should return aggregated quality and search logs in the dashboard', async () => {
      await SearchQueryLog.deleteMany({});
      const { AnalyticsService } = await import('../services/analytics.service.js');

      // Log mock searches
      await AnalyticsService.logSearchQuery(mockUserId, 'Python', {}, 5);
      await AnalyticsService.logSearchQuery(mockUserId, 'Python', {}, 5);
      await AnalyticsService.logSearchQuery(mockUserId, 'TypeScript', {}, 12);

      const dashboard = await AnalyticsService.getAnalyticsDashboard();
      expect(dashboard.totalQueries).toBe(3);
      expect(dashboard.topQueries.length).toBe(2);
      expect(dashboard.topQueries[0].query).toBe('Python');
      expect(dashboard.topQueries[0].count).toBe(2);
    });
  });
});
