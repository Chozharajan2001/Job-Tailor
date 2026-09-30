import mongoose from "mongoose";
import { CanonicalJob } from "../models/CanonicalJob.model.js";

/**
 * One-off measurement for TODO_PLAN #16: how much of the live index is old,
 * how much of it is repost churn, and how many listings trip each signal.
 * Run from apps/server with a populated index:
 *   npx tsx src/scripts/ghost-baseline.ts
 */
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  await mongoose.connect(uri);

  const jobs = await CanonicalJob.find({ isActive: true })
    .select(
      "companyName jobTitle location firstSeenAt lastSeenAt postedDate employmentType descriptionHashChanges description",
    )
    .lean();

  const now = Date.now();
  const spans = jobs.map(
    (j) => (now - new Date(j.firstSeenAt).getTime()) / DAY,
  );
  const buckets = { "<7": 0, "7-30": 0, "30-60": 0, "60-120": 0, ">120": 0 };
  for (const s of spans) {
    if (s < 7) buckets["<7"]++;
    else if (s < 30) buckets["7-30"]++;
    else if (s < 60) buckets["30-60"]++;
    else if (s < 120) buckets["60-120"]++;
    else buckets[">120"]++;
  }

  // firstSeenAt is set at first sighting, so a fresh index shows all "<7"
  // even though the listings themselves are old. postedDate comes from the
  // provider (Greenhouse first_published, Lever createdAt, ...) and carries
  // the true listing age — this is the bucket the span threshold must be
  // calibrated against.
  const postedBuckets = {
    "<7": 0,
    "7-30": 0,
    "30-60": 0,
    "60-120": 0,
    ">120": 0,
  };
  for (const j of jobs) {
    const anchor = j.postedDate ?? j.firstSeenAt;
    const age = (now - new Date(anchor).getTime()) / DAY;
    if (age < 7) postedBuckets["<7"]++;
    else if (age < 30) postedBuckets["7-30"]++;
    else if (age < 60) postedBuckets["30-60"]++;
    else if (age < 120) postedBuckets["60-120"]++;
    else postedBuckets[">120"]++;
  }

  const byRole = new Map<string, number>();
  for (const j of jobs) {
    const k = `${j.companyName}|${j.jobTitle}|${j.location}`;
    byRole.set(k, (byRole.get(k) ?? 0) + 1);
  }
  const churn = { dup2: 0, dup3plus: 0 };
  for (const n of byRole.values()) {
    if (n === 2) churn.dup2++;
    else if (n >= 3) churn.dup3plus++;
  }

  const evergreen =
    /always hiring|ongoing pipeline|rolling|we review continuously|year[- ]round/i;
  const evergreenHits = jobs.filter((j) =>
    evergreen.test(`${j.jobTitle} ${j.description ?? ""}`),
  ).length;
  const unchangedOld = jobs.filter(
    (j) => (j.descriptionHashChanges ?? 0) === 0,
  ).length;

  console.log(
    JSON.stringify(
      {
        activeListings: jobs.length,
        firstSightingAgeDaysBuckets: buckets,
        postedDateAgeDaysBuckets: postedBuckets,
        repostGroups: churn,
        evergreenHits,
        noContentChangeEver: unchangedOld,
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
