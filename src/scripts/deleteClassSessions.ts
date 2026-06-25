import 'dotenv/config';
import mongoose from 'mongoose';
import ClassSession from '../models/ClassSession';

async function run() {
  const uri = process.env.MONGODB_URI || '';
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri);
  console.log('✓ Connected to MongoDB');

  const result = await ClassSession.deleteMany({});
  console.log(`✓ Deleted ${result.deletedCount} ClassSession records`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
