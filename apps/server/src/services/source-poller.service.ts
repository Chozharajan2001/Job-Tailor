import {
  SourceRegistry,
  type ISourceRegistryDocument,
} from "../models/SourceRegistry.model.js";
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import { IngestionService } from "./ingestion.service.js";
import { CleanupService } from "./cleanup.service.js";
import { getConnector } from "./source-connectors/index.js";
import { runWithConcurrency } from "./source-poller.util.js";

export interface PollResult {
  sourceId: string;
  fetched: number;
  created: number;
  duplicates: number;
  failed: number;
  error?: string;
}

export interface PollSummary {
  due: number;
  polled: number;
  results: PollResult[];
}

/** Consecutive-failure count after which we auto-disable a source. */
const CIRCUIT_BREAKER_THRESHOLD = 5;
/** How many sources to poll concurrently per batch. */
const POLL_CONCURRENCY = 5;

function emptyResult(sourceId: string): PollResult {
  return { sourceId, fetched: 0, created: 0, duplicates: 0, failed: 0 };
}

/**
 * Poll one SourceRegistry row: fetch its current job list, run each
 * through the ingestion pipeline (dedup happens inside ingestJob), and
 * update trust + error counters based on the outcome.
 */
export async function pollSource(sourceId: string): Promise<PollResult> {
  const src = (await SourceRegistry.findById(
    sourceId,
  ).lean()) as ISourceRegistryDocument | null;
  if (!src || !src.connectorType) {
    return {
      ...emptyResult(sourceId),
      error: "source not found or not a connector row",
    };
  }

  const connector = getConnector(src.connectorType);

  try {
    const raws = await connector.fetchJobs(src.companyId ?? "_");
    let created = 0;
    let duplicates = 0;
    let failed = 0;

    for (const raw of raws) {
      try {
        const input = connector.toCanonicalJob(raw, src.name);
        const existing = await CanonicalJob.findOne({
          applyUrl: input.sourceUrl,
        });
        await IngestionService.ingestJob({
          sourceType: "api_connector",
          sourceName: src.name,
          sourceId: String(src._id),
          companyName: input.companyName,
          jobTitle: input.title,
          location: input.location,
          description: input.jdRawText,
          sourceUrl: input.sourceUrl,
          applyUrl: input.sourceUrl,
          employmentType: input.employmentType as
            | "full-time"
            | "part-time"
            | "contract"
            | "internship"
            | undefined,
          postedDate: input.publishedAt,
        });
        if (existing) duplicates++;
        else created++;
      } catch {
        failed++;
      }
    }

    await SourceRegistry.updateOne(
      { _id: sourceId },
      {
        $set: {
          lastPolledAt: new Date(),
          errorCount: 0,
          lastError: undefined,
        },
      },
    );
    await CleanupService.boostSourceTrust(sourceId, 0.01);

    return {
      sourceId,
      fetched: raws.length,
      created,
      duplicates,
      failed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await SourceRegistry.updateOne(
      { _id: sourceId },
      {
        $inc: { errorCount: 1 },
        $set: { lastError: message, lastPolledAt: new Date() },
      },
    );
    await CleanupService.decaySourceTrust(sourceId, 0.05);
    await SourceRegistry.updateOne(
      { _id: sourceId, errorCount: { $gte: CIRCUIT_BREAKER_THRESHOLD } },
      { $set: { isEnabled: false } },
    );
    return { ...emptyResult(sourceId), error: message };
  }
}

/**
 * Poll every enabled connector source whose crawl frequency window has
 * elapsed. Uses in-memory filtering rather than a Mongo time-arithmetic
 * query — the collection is small enough (dozens of rows, not millions)
 * that this is simpler than a $expr match.
 */
export async function pollDueSources(): Promise<PollSummary> {
  const now = Date.now();
  const sources = await SourceRegistry.find({
    isEnabled: true,
    connectorType: { $ne: null },
  }).lean();

  const due = sources.filter((s) => {
    const last = s.lastPolledAt?.getTime() ?? 0;
    const freq = s.crawlFrequency || 360;
    return (now - last) / 60000 >= freq;
  });

  const results = await runWithConcurrency(due, POLL_CONCURRENCY, (s) =>
    pollSource(String(s._id)),
  );

  return {
    due: due.length,
    polled: results.length,
    results,
  };
}
