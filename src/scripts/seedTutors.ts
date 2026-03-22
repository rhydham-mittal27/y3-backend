import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import User from '../models/User';
import Tutor from '../models/Tutor';
import Option from '../models/Option';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

async function connect() {
  if (!uri) throw new Error('Missing MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

async function main() {
  const inputPath = path.join(__dirname, '..', '..', '..', 'pyscripts', 'All-Tutors-normalized.csv');

  if (!fs.existsSync(inputPath)) {
    console.error('Input file not found:', inputPath);
    process.exit(1);
  }

  await connect();

  // Fetch valid subjects to flag new ones
  const subjectOptions = await Option.find({ type: 'SUBJECT', isActive: true });
  const validSubjectValues = new Set(subjectOptions.map(o => o.value));

  // Use XLSX for robust CSV parsing (handles newlines in quotes)
  const workbook = XLSX.readFile(inputPath);
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as any[];

  console.log(`Seeding ${rows.length} tutors...`);

  let seededCount = 0;
  let skipCount = 0;
  const newSubjectsFound = new Set<string>();

  for (const row of rows) {
    const { 
      name, phone, email, teacherId, 
      subjects, grades, 
      yearsOfExperience, qualifications,
      preferredMode, locations, bio, notes, createdAt
    } = row;

    const normalizedEmail = String(email || '').toLowerCase().trim();
    const normalizedPhone = String(phone || '').trim();

    if (!normalizedPhone && !normalizedEmail) {
      console.warn(`Skipping row - no phone or email: ${JSON.stringify(row)}`);
      skipCount++;
      continue;
    }

    const subjectList = subjects ? String(subjects).split('|').map((s: string) => s.trim()) : [];
    const gradeList = grades ? String(grades).split('|').map((s: string) => s.trim()) : [];

    // Check for new subjects to flag
    subjectList.forEach((s: string) => {
        if (s && s !== 'ALL_SUBJECTS' && !validSubjectValues.has(s)) {
            newSubjectsFound.add(s);
        }
    });

    try {
      // 1. Find or Create User
      let user = await User.findOne({ $or: [
        ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : [])
      ]});

      if (!user) {
        // Double check email before create (Mongoose validation)
        if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
           console.warn(`Skipping tutor ${name} due to invalid email: ${normalizedEmail}`);
           skipCount++;
           continue;
        }

        user = await User.create({
          name: name || 'Unknown Tutor',
          email: normalizedEmail,
          phone: normalizedPhone,
          password: normalizedPhone || 'TutorPassword123',
          role: 'TUTOR',
          isActive: true,
          gender: 'OTHER'
        });
      }

      // 2. Find or Create Tutor Profile
      await Tutor.findOneAndUpdate(
        { user: user._id },
        {
          teacherId: teacherId,
          subjects: subjectList,
          grades: gradeList,
          qualifications: qualifications ? [qualifications] : [],
          yearsOfExperience: parseInt(yearsOfExperience) || 0,
          preferredMode: preferredMode || 'OFFLINE',
          preferredLocations: locations ? [locations] : [],
          bio: bio || undefined,
          verificationNotes: notes || undefined,
          isAvailable: true,
          verificationStatus: 'PENDING',
          createdAt: createdAt ? new Date(createdAt) : new Date()
        },
        { upsert: true, new: true }
      );

      seededCount++;
      if (seededCount % 50 === 0) console.log(`Seeded ${seededCount} tutors...`);
    } catch (err: any) {
      console.error(`Error seeding tutor ${name}:`, err.message);
      skipCount++;
    }
  }

  console.log(`\n── Final Results ──`);
  console.log(`Successfully seeded: ${seededCount}`);
  console.log(`Skipped:             ${skipCount}`);
  
  if (newSubjectsFound.size > 0) {
    console.log(`\n⚠️ New subjects found (not in Option DB):`);
    Array.from(newSubjectsFound).sort().forEach(s => console.log(`  - ${s}`));
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
