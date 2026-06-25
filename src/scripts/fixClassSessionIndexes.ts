/**
 * fixClassSessionIndexes.ts
 *
 * Drops the stale `groupClass_1_sessionDate_1` unique index from classsessions.
 * That index was created without `sparse: true`, so multiple FinalClass sessions
 * (groupClass: null) on the same date from different classes trigger E11000.
 *
 * Safe to re-run — drops index only if it exists.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/fixClassSessionIndexes.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';

async function run() {
  const uri = process.env.MONGODB_URI || '';
  if (!uri) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(uri);
  console.log('✓ Connected to MongoDB');

  const db = mongoose.connection.db!;
  const collection = db.collection('classsessions');

  const indexes = await collection.indexes();
  console.log('\nExisting indexes:');
  indexes.forEach((idx) => console.log(' -', idx.name, JSON.stringify(idx.key)));

  const BAD_INDEXES = ['groupClass_1_sessionDate_1'];

  for (const name of BAD_INDEXES) {
    const exists = indexes.some((idx) => idx.name === name);
    if (exists) {
      await collection.dropIndex(name);
      console.log(`\n✓ Dropped index: ${name}`);
    } else {
      console.log(`\n– Index not found (already clean): ${name}`);
    }
  }

  console.log('\nDone.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
