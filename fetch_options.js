require('dotenv').config({ path: __dirname + '/.env' });
const mongoose = require('mongoose');
const fs = require('fs');

const uri = process.env.MONGODB_URI || '';

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  
  const options = await db.collection('options').find({ isActive: true }).toArray();
  
  const subjects = options.filter(o => o.type === 'SUBJECT').map(o => ({ label: o.label, value: o.value }));
  const boards = options.filter(o => o.type === 'BOARD').map(o => ({ label: o.label, value: o.value }));
  const grades = options.filter(o => o.type === 'GRADE').map(o => ({ label: o.label, value: o.value }));
  
  const lines = [];
  
  lines.push('=== SUBJECTS ===');
  subjects.forEach(s => lines.push(`  ${s.label} => ${s.value}`));
  
  lines.push('\n=== BOARDS ===');
  boards.forEach(b => lines.push(`  ${b.label} => ${b.value}`));
  
  lines.push('\n=== GRADES ===');
  grades.forEach(g => lines.push(`  ${g.label} => ${g.value}`));
  
  const admin = await db.collection('users').findOne({ role: 'ADMIN' });
  if (admin) {
    lines.push('\n=== ADMIN USER ===');
    lines.push(`  _id: ${admin._id}`);
    lines.push(`  name: ${admin.name || admin.email}`);
  }
  
  fs.writeFileSync(__dirname + '/db_options.md', lines.join('\n'), 'utf-8');
  console.log('Done - wrote db_options.md');
  
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
