import { SourceRegistry } from '../models/SourceRegistry.model.js';
import { CanonicalJob, ICanonicalJobDocument } from '../models/CanonicalJob.model.js';
import { DeduplicationService } from './deduplication.service.js';
import { parseJD } from './jd-parser.service.js'; // Use existing parser for IParsedJD structure if needed or mock it
import { URL } from 'url';

export class IngestionService {
  /**
   * Helper to ensure basic sources exist in the SourceRegistry
   */
  static async ensureDefaultSources() {
    const manual = await SourceRegistry.findOne({ sourceType: 'manual_paste' });
    if (!manual) {
      await SourceRegistry.create({
        name: 'Manual Paste Ingest',
        sourceType: 'manual_paste',
        baseUrl: 'local://manual',
        crawlFrequency: 0,
        extractionStrategy: 'manual_input',
        trustScore: 1.0,
        isEnabled: true,
      });
    }

    const publicPage = await SourceRegistry.findOne({ name: 'Public Job Page Ingest' });
    if (!publicPage) {
      await SourceRegistry.create({
        name: 'Public Job Page Ingest',
        sourceType: 'public_job_page',
        baseUrl: 'http://',
        crawlFrequency: 1440,
        extractionStrategy: 'json_ld',
        trustScore: 0.8,
        isEnabled: true,
      });
    }
  }

  /**
   * Ingest a job from a manual copy-paste description
   */
  static async ingestFromPaste(params: {
    jobTitle: string;
    companyName: string;
    jdRawText: string;
    location?: string;
    workType?: 'remote' | 'hybrid' | 'onsite';
    employmentType?: 'full-time' | 'part-time' | 'contract' | 'internship';
    salaryRange?: { min: number; max: number; currency: string };
  }): Promise<ICanonicalJobDocument> {
    await this.ensureDefaultSources();
    const source = await SourceRegistry.findOne({ sourceType: 'manual_paste' });

    const company = params.companyName.trim();
    const title = params.jobTitle.trim();
    const loc = params.location?.trim() || 'remote';
    const work = params.workType || 'remote';
    const description = params.jdRawText.trim();

    // Layer 2 & 3 dedupe keys
    const dedupeKey = DeduplicationService.generateDedupeKey(company, title, loc);
    const descriptionHash = DeduplicationService.generateDescriptionHash(description);

    // Look for duplicates
    const duplicate = await DeduplicationService.findDuplicate(undefined, dedupeKey, descriptionHash);
    if (duplicate) {
      duplicate.lastSeenAt = new Date();
      duplicate.isActive = true; // reactivate if expired
      await duplicate.save();
      return duplicate;
    }

    // Attempt to extract structured fields using the AI JD Parser service (if available and text is long enough)
    let structuredJD;
    try {
      if (description.length > 50) {
        structuredJD = await parseJD(description);
      }
    } catch (e) {
      console.warn('AI structured parse failed, falling back to simple mapping:', e);
    }

    // Save canonical record
    const canonicalJob = await CanonicalJob.create({
      sourceId: source?._id,
      sourceName: source?.name || 'Manual Paste Ingest',
      companyName: company,
      jobTitle: title,
      location: loc,
      workType: work,
      employmentType: params.employmentType || 'full-time',
      salaryRange: params.salaryRange,
      description,
      structuredJD,
      extractionConfidence: 1.0,
      dedupeKey,
      descriptionHash,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      isActive: true,
    });

    return canonicalJob;
  }

  /**
   * Ingest a job by fetching and parsing a public URL
   */
  static async ingestFromUrl(urlStr: string): Promise<ICanonicalJobDocument> {
    await this.ensureDefaultSources();
    const parsedUrl = new URL(urlStr);
    const host = parsedUrl.hostname;

    // Check if the source is registered or find the public board type
    let source = await SourceRegistry.findOne({ baseUrl: { $regex: host, $options: 'i' }, isEnabled: true });
    if (!source) {
      source = await SourceRegistry.findOne({ sourceType: 'public_job_page' });
    }

    // Fetch raw HTML
    const response = await fetch(urlStr, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch job URL: ${response.statusText} (${response.status})`);
    }

    const html = await response.text();

    // 1. JSON-LD JobPosting Extraction
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let jobPosting: any = null;

    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const json = JSON.parse(match[1].trim());
        const findJobPosting = (obj: any): any => {
          if (!obj) return null;
          if (Array.isArray(obj)) {
            for (const item of obj) {
              const res = findJobPosting(item);
              if (res) return res;
            }
          }
          if (obj['@type'] === 'JobPosting' || obj.type === 'JobPosting') {
            return obj;
          }
          if (obj['@graph'] && Array.isArray(obj['@graph'])) {
            return findJobPosting(obj['@graph']);
          }
          return null;
        };

        const res = findJobPosting(json);
        if (res) {
          jobPosting = res;
          break;
        }
      } catch (e) {
        // Ignored
      }
    }

    let companyName = '';
    let jobTitle = '';
    let description = '';
    let location = 'remote';
    let applyUrl = urlStr;
    let postedDate: Date | undefined;
    let employmentType: 'full-time' | 'part-time' | 'contract' | 'internship' = 'full-time';
    let confidence = 0.5;

    if (jobPosting) {
      confidence = 1.0;
      jobTitle = jobPosting.title || '';
      companyName = jobPosting.hiringOrganization?.name || 
                    (typeof jobPosting.hiringOrganization === 'string' ? jobPosting.hiringOrganization : '');
      description = jobPosting.description || '';
      applyUrl = jobPosting.url || urlStr;

      // Extract location
      if (jobPosting.jobLocation) {
        const locObj = jobPosting.jobLocation;
        if (locObj.address) {
          const addr = locObj.address;
          location = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
            .filter(Boolean)
            .join(', ') || 'remote';
        } else if (typeof locObj === 'string') {
          location = locObj;
        }
      }

      // Extract posted date
      if (jobPosting.datePosted) {
        postedDate = new Date(jobPosting.datePosted);
      }

      // Employment type mapping
      if (jobPosting.employmentType) {
        const typeStr = String(jobPosting.employmentType).toLowerCase();
        if (typeStr.includes('part')) employmentType = 'part-time';
        else if (typeStr.includes('contract') || typeStr.includes('temp')) employmentType = 'contract';
        else if (typeStr.includes('intern')) employmentType = 'internship';
      }
    } else {
      // 2. Fallback Metadata Extraction
      const extractMeta = (regex: RegExp, str: string): string => {
        const m = regex.exec(str);
        return m ? m[1].replace(/&amp;/g, '&').trim() : '';
      };

      const metaTitle = extractMeta(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i, html) ||
                        extractMeta(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i, html) ||
                        /<title>([^<]+)<\/title>/i.exec(html)?.[1] || '';
      
      const metaDesc = extractMeta(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i, html) ||
                       extractMeta(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i, html);

      const metaSiteName = extractMeta(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i, html);

      // Clean title and try to extract company name
      // Title tags are often "Job Title at Company" or "Company - Job Title"
      jobTitle = metaTitle.split(/ at | - | \| /)[0]?.trim() || 'Job Opening';
      companyName = metaSiteName || metaTitle.split(/ at /)[1]?.trim() || host.replace('www.', '').split('.')[0] || 'Unknown Company';
      description = metaDesc || html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000); // extreme raw fallback
      confidence = 0.4;
    }

    // Cleanup HTML tags from description string for database safety
    const cleanDesc = description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!jobTitle || !companyName || !cleanDesc) {
      throw new Error('Failed to extract minimum job details (title, company, description) from URL.');
    }

    // Work type heuristics
    let workType: 'remote' | 'hybrid' | 'onsite' = 'remote';
    const locationLower = location.toLowerCase();
    const descLower = cleanDesc.toLowerCase();
    const titleLower = jobTitle.toLowerCase();

    if (locationLower.includes('hybrid') || descLower.includes('hybrid')) {
      workType = 'hybrid';
    } else if (locationLower.includes('onsite') || locationLower.includes('on-site') || 
               descLower.includes('office only') || descLower.includes('work from office')) {
      workType = 'onsite';
    } else if (locationLower.includes('remote') || descLower.includes('remote friendly') || titleLower.includes('remote')) {
      workType = 'remote';
    }

    // Generate dedupe keys
    const dedupeKey = DeduplicationService.generateDedupeKey(companyName, jobTitle, location);
    const descriptionHash = DeduplicationService.generateDescriptionHash(cleanDesc);

    // Look for duplicate canonical job
    const duplicate = await DeduplicationService.findDuplicate(applyUrl, dedupeKey, descriptionHash);
    if (duplicate) {
      duplicate.lastSeenAt = new Date();
      duplicate.isActive = true; // reactivate if expired
      await duplicate.save();
      return duplicate;
    }

    // Extract structured JD using existing AI Parser (if applicable and description is robust)
    let structuredJD;
    try {
      if (cleanDesc.length > 50) {
        structuredJD = await parseJD(cleanDesc);
      }
    } catch (e) {
      console.warn('AI structured parse failed during URL ingestion:', e);
    }

    // Create the CanonicalJob record
    const canonicalJob = await CanonicalJob.create({
      sourceId: source?._id,
      sourceName: source?.name || 'Public URL Ingest',
      sourceUrl: urlStr,
      companyName,
      jobTitle,
      location,
      workType,
      employmentType,
      postedDate,
      applyUrl,
      description: cleanDesc,
      structuredJD,
      rawHtmlSnapshot: html,
      extractionConfidence: confidence,
      dedupeKey,
      descriptionHash,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      isActive: true,
    });

    return canonicalJob;
  }
}
