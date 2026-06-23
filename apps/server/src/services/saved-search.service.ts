import { SavedSearch } from '../models/SavedSearch.model.js';

export class SavedSearchService {
  /**
   * Create a new saved search alert configuration for a user.
   */
  static async createSavedSearch(
    userId: string,
    data: {
      name: string;
      query?: string;
      filters?: { location?: string; workType?: string; companyName?: string };
      alertSubscription?: { emailEnabled: boolean; inAppEnabled: boolean };
    }
  ) {
    return await SavedSearch.create({
      userId,
      name: data.name,
      query: data.query,
      filters: data.filters || {},
      alertSubscription: data.alertSubscription || { emailEnabled: false, inAppEnabled: true },
    });
  }

  /**
   * List all saved search configurations for a specific user.
   */
  static async listSavedSearches(userId: string) {
    return await SavedSearch.find({ userId }).sort({ createdAt: -1 }).lean().exec();
  }

  /**
   * Update a specific saved search configuration.
   */
  static async updateSavedSearch(
    userId: string,
    id: string,
    data: {
      name?: string;
      query?: string;
      filters?: { location?: string; workType?: string; companyName?: string };
      alertSubscription?: { emailEnabled: boolean; inAppEnabled: boolean };
    }
  ) {
    return await SavedSearch.findOneAndUpdate(
      { _id: id, userId },
      { $set: data },
      { new: true }
    ).exec();
  }

  /**
   * Delete a saved search configuration.
   */
  static async deleteSavedSearch(userId: string, id: string): Promise<boolean> {
    const result = await SavedSearch.deleteOne({ _id: id, userId }).exec();
    return result.deletedCount > 0;
  }
}
