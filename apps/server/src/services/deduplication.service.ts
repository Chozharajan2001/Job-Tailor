import { CanonicalJob, ICanonicalJobDocument } from '../models/CanonicalJob.model.js';
import crypto from 'crypto';

export class DeduplicationService {
  /**
   * Normalize text to slug-like format for exact matching (remove spaces, special characters, lowercase)
   */
  static normalizeString(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Generate canonical dedupe key for company name + job title + location
   */
  static generateDedupeKey(companyName: string, jobTitle: string, location: string): string {
    const comp = this.normalizeString(companyName);
    const title = this.normalizeString(jobTitle);
    const loc = this.normalizeString(location || 'remote');
    return `${comp}_${title}_${loc}`;
  }

  /**
   * Generate a normalized hash of description text
   */
  static generateDescriptionHash(description: string): string {
    // Strip HTML tag markup if present, lowercase, strip whitespace
    const cleanText = description
      .replace(/<[^>]*>/g, '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .slice(0, 1000); // hash first 1000 clean chars to avoid minor trailing changes
    return crypto.createHash('sha256').update(cleanText).digest('hex');
  }

  /**
   * Find duplicate canonical job using L1/L2/L3 layered checks
   */
  static async findDuplicate(
    applyUrl?: string,
    dedupeKey?: string,
    descriptionHash?: string
  ): Promise<ICanonicalJobDocument | null> {
    // Layer 1: Exact URL match (checked on applyUrl or sourceUrl, ignoring query params & trailing slash)
    if (applyUrl) {
      const cleanUrl = applyUrl.toLowerCase().split('?')[0].replace(/\/$/, '');
      const duplicateByUrl = await CanonicalJob.findOne({
        $or: [
          { applyUrl: { $regex: new RegExp(`^${escapeRegExp(cleanUrl)}`, 'i') } },
          { sourceUrl: { $regex: new RegExp(`^${escapeRegExp(cleanUrl)}`, 'i') } },
        ],
        isActive: true,
      });
      if (duplicateByUrl) return duplicateByUrl;
    }

    // Layer 2: Exact normalized companyName + jobTitle + location key match
    if (dedupeKey) {
      const duplicateByKey = await CanonicalJob.findOne({
        dedupeKey,
        isActive: true,
      });
      if (duplicateByKey) return duplicateByKey;
    }

    // Layer 3: Normalized description text hash match
    if (descriptionHash) {
      const duplicateByHash = await CanonicalJob.findOne({
        descriptionHash,
        isActive: true,
      });
      if (duplicateByHash) return duplicateByHash;
    }

    return null;
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
