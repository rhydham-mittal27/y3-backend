import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import User from '../models/User';
import ClassLead, { IClassLeadDocument } from '../models/ClassLead';
import { CLASS_LEAD_STATUS, TEACHING_MODE, PREFERRED_TUTOR_GENDER, LEAD_SOURCE } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

type NormalizedLeadRow = {
  studentName: string;
  studentGender: 'M' | 'F';
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  grade?: string;
  board?: string;
  subject: string[];
  mode: string;
  location?: string;
  preferredTutorGender?: string;
  status: string;
  notes?: string;
  demoDateTime?: string;
  demoTutorName?: string;
  leadSource?: string;
  paymentReceived?: boolean;
  createdAt?: string;
  studentType: string;
  timing: string;
};

async function connect() {
  if (!uri) throw new Error('Missing MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  console.log('[seedLeadsFromNormalizedJson] Connected to MongoDB');
}

async function generateLeadId(currentIndex: number): Promise<string> {
    return `LDR${String(currentIndex + 1).padStart(5, '0')}`;
}

async function main() {
  const filePath = path.join(process.cwd(), '..', 'pyscripts', 'normalized_leads.json');

  if (!fs.existsSync(filePath)) {
    console.error('[seedLeadsFromNormalizedJson] Input file not found:', filePath);
    process.exit(1);
  }

  await connect();

  // Clear existing leads as per strict instruction for "correctness of data"
  console.log('[seedLeadsFromNormalizedJson] Clearing existing class leads...');
  await ClassLead.deleteMany({});

  let admin = await User.findOne({ role: { $in: ['ADMIN', 'MANAGER'] } });
  if (!admin) {
    console.log('[seedLeadsFromNormalizedJson] No ADMIN or MANAGER found. Creating default admin...');
    const defaultPassword = process.env.SEED_DEFAULT_PASSWORD || 'Admin@123';
    admin = await User.create({
        name: 'System Admin',
        email: 'admin@yourshikshak.com',
        password: defaultPassword,
        role: 'ADMIN',
        isActive: true,
        acceptedTerms: true
    });
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = JSON.parse(raw) as NormalizedLeadRow[];

  console.log(`[seedLeadsFromNormalizedJson] Starting seeding of ${rows.length} leads...`);

  let created = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const leadId = await generateLeadId(i);

    let demoTutorId = null;
    if (row.demoTutorName && row.demoTutorName.toLowerCase() !== 'na') {
        const tutorUser = await User.findOne({ 
            name: { $regex: new RegExp('^' + row.demoTutorName + '$', 'i') },
            role: 'TUTOR'
        });
        if (tutorUser) {
            demoTutorId = tutorUser._id;
        } else {
            // Try fuzzy match if exact fails
            const fuzzyTutor = await User.findOne({
                name: { $regex: new RegExp(row.demoTutorName, 'i') },
                role: 'TUTOR'
            });
            if (fuzzyTutor) demoTutorId = fuzzyTutor._id;
        }
    }

    const demoDetails = demoTutorId ? {
        demoDate: row.demoDateTime ? new Date(row.demoDateTime) : undefined,
        demoTime: row.demoDateTime, // Storing raw string for now
        demoStatus: 'SCHEDULED'
    } : undefined;

    try {
        await ClassLead.create({
            leadId,
            studentName: row.studentName,
            studentGender: row.studentGender,
            parentName: row.parentName,
            parentPhone: row.parentPhone,
            parentEmail: row.parentEmail,
            grade: row.grade,
            board: row.board,
            subject: row.subject,
            mode: row.mode,
            location: row.location,
            preferredTutorGender: row.preferredTutorGender,
            status: row.status,
            notes: row.notes,
            createdAt: new Date(row.createdAt || Date.now()),
            studentType: row.studentType,
            timing: row.timing,
            createdBy: admin._id,
            demoTutor: demoTutorId,
            demoDetails: demoDetails,
            leadSource: row.leadSource,
            paymentReceived: row.paymentReceived
        });
        created++;
        if (created % 50 === 0) {
            console.log(`[seedLeadsFromNormalizedJson] Created ${created} leads...`);
        }
    } catch (err: any) {
        failed++;
        if (err.name === 'ValidationError') {
            const errors = Object.keys(err.errors).map(key => `${key}: ${err.errors[key].message}`);
            console.error(`[seedLeadsFromNormalizedJson] Validation error at index ${i} (${row.studentName}):`, errors.join(', '));
        } else {
            console.error(`[seedLeadsFromNormalizedJson] Error at index ${i} (${row.studentName}):`, err.message || err);
        }
    }
  }

  console.log(`[seedLeadsFromNormalizedJson] Done. Created: ${created}, Failed: ${failed}`);
  await mongoose.disconnect();
}

main().catch(console.error);
