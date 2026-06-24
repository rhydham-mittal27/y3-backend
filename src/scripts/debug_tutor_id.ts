import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.db!;

  const id = '6a291c771539de48cf9dddee';

  const byId = await db.collection('tutors').findOne({ _id: new mongoose.Types.ObjectId(id) });
  console.log('By _id:', byId ? `found — teacherId: ${byId.teacherId}` : 'NOT FOUND');

  const byUser = await db.collection('tutors').findOne({ user: new mongoose.Types.ObjectId(id) });
  console.log('By user:', byUser ? `found — teacherId: ${byUser.teacherId}` : 'NOT FOUND');

  const byUserId = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(id) });
  console.log('In users collection:', byUserId ? `found — name: ${byUserId.name || byUserId.firstName}` : 'NOT FOUND');

  process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });
