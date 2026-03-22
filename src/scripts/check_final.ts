import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ys-v3';

async function check() {
  await mongoose.connect(MONGODB_URI);
  
  const opt = await mongoose.connection.db!.collection('options').findOne({ type: 'SUBJECT' });
  console.log('Sample Subject Option:', opt);

  const lead = await mongoose.connection.db!.collection('classleads').findOne({ subject: { $exists: true, $not: { $size: 0 } } });
  console.log('Sample Lead with subject:', lead?.leadId, lead?.subject);

  if (lead && lead.subject && lead.subject[0] && opt) {
      console.log('Comparing lead subject with option value:');
      console.log(`Lead subject: "${lead.subject[0]}"`);
      console.log(`Option value: "${opt.value}"`);
      console.log(`Match? ${String(lead.subject[0]).toLowerCase() === String(opt.value).toLowerCase()}`);
  }

  await mongoose.disconnect();
}

check();
