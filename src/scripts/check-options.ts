import 'dotenv/config';
import mongoose from 'mongoose';
import Option from '../models/Option';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

async function run() {
  await mongoose.connect(uri);
  const opts = await Option.find({ type: { $in: ['BOARD', 'GRADE', 'SUBJECT'] } });
  console.log(JSON.stringify(opts.map(o => ({ 
    type: o.type, 
    label: o.label, 
    value: o.value, 
    parent: o.parent,
    id: o._id
  })), null, 2));
  await mongoose.disconnect();
}

run().catch(console.error);
