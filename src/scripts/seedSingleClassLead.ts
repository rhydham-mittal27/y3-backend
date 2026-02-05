import 'dotenv/config';
import mongoose from 'mongoose';
import ClassLead from '../models/ClassLead';
import User from '../models/User';
import { BOARD_TYPE, CLASS_LEAD_STATUS, TEACHING_MODE, LEAD_SOURCE, PREFERRED_TUTOR_GENDER } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/ys-final';

async function connect() {
  await mongoose.connect(uri);
  console.log('[seedSingleClassLead] Connected to MongoDB');
}

async function main() {
  await connect();

  // 1. Find an admin or manager to be the creator
  const creator = await User.findOne({ role: { $in: ['ADMIN', 'MANAGER'] } });
  if (!creator) {
    console.error('[seedSingleClassLead] No ADMIN or MANAGER found in the database. Please run seed:admin first.');
    return;
  }

  // 2. Define the lead data
  const leadData = {
    leadId: 'LJD0S0ABCD789', // Example ID format
    studentType: 'SINGLE',
    studentName: 'John Doe',
    studentGender: 'M',
    parentName: 'Jane Doe',
    parentEmail: 'jane.doe@example.com',
    parentPhone: '9876543210',
    grade: '10th',
    subject: ['Mathematics', 'Physics'],
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.ONLINE,
    location: 'Mumbai, Maharashtra',
    city: 'Mumbai',
    area: 'Andheri East',
    address: '123, Sunshine Apartments, Near Metro Station',
    timing: 'Evening, 6:00 PM - 8:00 PM',
    status: CLASS_LEAD_STATUS.NEW,
    classesPerMonth: 8,
    classDurationHours: 1.5,
    paymentAmount: 5000,
    tutorFees: 3500,
    preferredTutorGender: PREFERRED_TUTOR_GENDER.NO_PREFERENCE,
    leadSource: LEAD_SOURCE.GOOGLE_PROFILE,
    createdBy: creator._id,
    notes: 'Seed lead created for testing payment integration and status flow.',
  };

  // 3. Check for existing lead with same studentName and creator to avoid duplicates
  const existing = await ClassLead.findOne({ studentName: leadData.studentName, createdBy: creator._id });
  if (existing) {
    console.log('[seedSingleClassLead] Lead already exists for student:', leadData.studentName);
  } else {
    const lead = await ClassLead.create(leadData);
    console.log('[seedSingleClassLead] Created class lead:', lead.studentName, '(ID:', lead.leadId + ')');
  }
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error('[seedSingleClassLead] Failed', e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
