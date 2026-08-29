import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Isolated in-memory MongoDB for tests.
 *
 * Each test file gets its own disposable instance — no shared dev database,
 * no credentials, no cross-suite interference, and it works identically in CI.
 */
let mongod: MongoMemoryServer | null = null;

export async function connectTestDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

export async function disconnectTestDb(): Promise<void> {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

/**
 * Wipe every collection in the current test database.
 * Safe here because the database is a throwaway in-memory instance.
 */
export async function clearAllCollections(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
}
