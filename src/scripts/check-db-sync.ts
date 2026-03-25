import 'dotenv/config';
import mongoose from 'mongoose';
import Option from '../models/Option';

const TARGET_ID = '69c110ebe283cd187ebdf3c1';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not found in .env');
    return;
  }

  console.log('📡 Connecting to:', uri.split('@')[1] || 'Local DB');
  await mongoose.connect(uri);

  console.log('\n--- 🔍 Checking Target ID ---');
  const target = await Option.findById(TARGET_ID);
  if (target) {
    console.log(`✅ FOUND: ${target.label} (Type: ${target.type}, Value: ${target.value})`);
  } else {
    console.log(`❌ NOT FOUND: ID ${TARGET_ID} does not exist in this database.`);
  }

  console.log('\n--- 📚 Available Subjects (First 10) ---');
  const subjects = await Option.find({ type: 'SUBJECT' }).limit(10);
  if (subjects.length === 0) {
    console.log('⚠️ No subjects found in the database. Did you run the seed script?');
  } else {
    subjects.forEach(s => {
      console.log(`• [${s._id}] ${s.label}`);
    });
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});
