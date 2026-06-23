import { SavedSearch } from '../models/SavedSearch.model.js';
import { Alert } from '../models/Alert.model.js';
import { ICanonicalJobDocument } from '../models/CanonicalJob.model.js';

export class AlertDispatcherService {
  /**
   * Evaluates a newly ingested job against all users' saved searches
   * and creates Alert entries for any matches.
   */
  static async dispatchAlertsForJob(job: ICanonicalJobDocument): Promise<void> {
    try {
      const savedSearches = await SavedSearch.find().lean().exec();
      const titleLower = (job.jobTitle || '').toLowerCase();
      const companyLower = (job.companyName || '').toLowerCase();
      const descLower = (job.description || '').toLowerCase();
      const locationLower = (job.location || '').toLowerCase();
      const workTypeLower = (job.workType || '').toLowerCase();

      const alertsToCreate = [];

      for (const search of savedSearches) {
        let isMatch = true;

        // 1. Evaluate Query (Keyword + Synonyms)
        if (search.query) {
          const queryLower = search.query.toLowerCase().trim();
          
          // Helper to check if a word/synonym matches job fields
          const matchesTerm = (term: string): boolean => {
            let pattern = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (term === 'react' || term === 'reactjs' || term === 'react.js') {
              pattern = '\\b(react(js|\\.js)?)\\b';
            } else if (term === 'node' || term === 'node.js' || term === 'nodejs') {
              pattern = '\\b(node(\\.js|js)?)\\b';
            } else if (term === 'devops' || term === 'sre' || term === 'site reliability') {
              pattern = '\\b(devops|sre|site reliability)\\b';
            } else if (term === 'typescript' || term === 'ts') {
              pattern = '\\b(typescript|ts)\\b';
            } else if (term === 'javascript' || term === 'js') {
              pattern = '\\b(javascript|js)\\b';
            } else {
              pattern = '\\b' + pattern + '\\b';
            }
            const regex = new RegExp(pattern, 'i');
            return regex.test(titleLower) || regex.test(companyLower) || regex.test(descLower);
          };

          // Check if any part of the query matches
          const terms = queryLower.split(/\s+/).filter(t => t.length >= 2);
          if (terms.length > 0) {
            const queryMatches = terms.some(t => matchesTerm(t));
            if (!queryMatches) {
              isMatch = false;
            }
          } else {
            if (!titleLower.includes(queryLower) && 
                !companyLower.includes(queryLower) && 
                !descLower.includes(queryLower)) {
              isMatch = false;
            }
          }
        }

        // 2. Evaluate Location Filter
        if (isMatch && search.filters?.location) {
          const locFilter = search.filters.location.toLowerCase().trim();
          if (!locationLower.includes(locFilter)) {
            isMatch = false;
          }
        }

        // 3. Evaluate Work Type Filter
        if (isMatch && search.filters?.workType) {
          const wtFilter = search.filters.workType.toLowerCase().trim();
          if (workTypeLower !== wtFilter) {
            isMatch = false;
          }
        }

        // 4. Evaluate Company Name Filter
        if (isMatch && search.filters?.companyName) {
          const compFilter = search.filters.companyName.toLowerCase().trim();
          if (!companyLower.includes(compFilter)) {
            isMatch = false;
          }
        }

        // If it matches all criteria, stage the Alert creation
        if (isMatch) {
          alertsToCreate.push({
            userId: search.userId,
            savedSearchId: search._id,
            canonicalJobId: job._id,
            isRead: false,
          });
        }
      }

      // Batch insert matching alerts to keep DB traffic low
      if (alertsToCreate.length > 0) {
        await Alert.insertMany(alertsToCreate);
        console.log(`📡 AlertDispatcher: Triggered ${alertsToCreate.length} alerts for job "${job.jobTitle}"`);
      }
    } catch (error) {
      console.error('❌ AlertDispatcher: Failed to dispatch alerts:', error);
    }
  }
}
