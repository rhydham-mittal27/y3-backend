import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import ClassLead from '../models/ClassLead';
import Option from '../models/Option';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';
const ADMIN_ID = '69b6eb5e3c993b09f872cd47';

async function connect() {
  if (!uri) throw new Error('Missing MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

// Simple but robust CSV parser for our known format
function parseCSV(content: string) {
  const lines = content.split(/\r?\n/);
  const headers = lines[0].split(',');
  const result: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Regex to handle quoted commas
    const pattern = /(".*?"|[^",\s][^",]*|(?<=,|^)(?=,|$))/g;
    const matches = line.match(pattern) || [];
    const row: any = {};
    
    headers.forEach((h, index) => {
      let val = matches[index] || '';
      val = val.replace(/^"|"$/g, '').trim();
      row[h.trim()] = val;
    });
    result.push(row);
  }
  return { headers, rows: result };
}

async function main() {
  const inputPath = path.join(__dirname, '..', '..', '..', 'pyscripts', 'class-leads-normalized.csv');
  const failedPath = path.join(__dirname, '..', '..', '..', 'pyscripts', 'class-leads-failed-subjects.csv');

  if (!fs.existsSync(inputPath)) {
    console.error('Input file not found:', inputPath);
    process.exit(1);
  }

  await connect();

  // Fetch valid subjects from DB
  const subjectOptions = await Option.find({ type: 'SUBJECT', isActive: true });
  const validSubjectValues = new Set(subjectOptions.map(o => o.value));

  console.log(`Found ${validSubjectValues.size} valid subjects in DB.`);

  const rawData = fs.readFileSync(inputPath, 'utf-8');
  const { headers, rows } = parseCSV(rawData);

  console.log(`Processing ${rows.length} rows...`);

  let seededCount = 0;
  let skippedCount = 0;
  const failedRows: any[] = [];
  const missingSubjects = new Set<string>();

  for (const row of rows) {
    const leadId = row.leadId;
    const studentName = row.studentName;
    const subjectStr = row.subject;

    const subjects = subjectStr ? String(subjectStr).split('|').map(s => s.trim()).filter(s => s) : [];
    
    // Check if all subjects are valid
    const invalidInRow = subjects.filter(s => !validSubjectValues.has(s));

    if (invalidInRow.length > 0) {
      invalidInRow.forEach(s => missingSubjects.add(s));
      failedRows.push(row);
      skippedCount++;
      continue;
    }

    try {
      await ClassLead.findOneAndUpdate(
        { leadId },
        {
          leadId,
          studentType: row.studentType || 'SINGLE',
          studentName: studentName || undefined,
          parentName: row.parentName || undefined,
          parentPhone: row.parentPhone || undefined,
          grade: row.grade || 'LEGACY',
          board: row.board || 'OTHER',
          subject: subjects,
          mode: row.mode || 'OFFLINE',
          location: row.location || undefined,
          city: row.city || 'Bhopal',
          preferredTutorGender: row.preferredTutorGender || 'NO_PREFERENCE',
          timing: row.timing || 'TBD',
          status: row.status || 'NEW',
          leadSource: row.leadSource || 'OTHER',
          paymentReceived: row.paymentReceived === 'true',
          notes: row.notes || undefined,
          demoDetails: (row.demoDateAndTime && !row.demoDateAndTime.includes('T')) ? {
             // Handle raw string if normalization didn't convert to ISO
             demoDate: new Date(row.demoDateAndTime),
             demoStatus: 'SCHEDULED'
          } : (row.demoDateAndTime ? {
             demoDate: new Date(row.demoDateAndTime),
             demoStatus: 'SCHEDULED'
          } : undefined),
          createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
          createdBy: new mongoose.Types.ObjectId(ADMIN_ID)
        },
        { upsert: true, new: true }
      );
      seededCount++;
    } catch (err: any) {
      console.error(`Error seeding lead ${leadId}:`, err.message);
      failedRows.push(row);
      skippedCount++;
    }
  }

  // Write failed rows to CSV
  if (failedRows.length > 0) {
    const csvLines = [headers.join(',')];
    failedRows.forEach(row => {
      const line = headers.map(h => {
        let val = String(row[h] || '');
        if (val.includes(',') || val.includes('"')) {
          val = `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',');
      csvLines.push(line);
    });
    fs.writeFileSync(failedPath, csvLines.join('\n'));
    console.log(`Wrote ${failedRows.length} failed rows to ${failedPath}`);
  }

  console.log(`\n── Results ──`);
  console.log(`Successfully seeded: ${seededCount}`);
  console.log(`Skipped:             ${skippedCount}`);
  
  if (missingSubjects.size > 0) {
    console.log(`\n⚠️ Missing subjects in Option DB:`);
    Array.from(missingSubjects).sort().forEach(s => console.log(`  - ${s}`));
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
