import 'dotenv/config';
import mongoose from 'mongoose';
import ClassLead from '../models/ClassLead';
import User from '../models/User';
import Groupleads from '../models/GroupClass';
import { generateLeadId } from '../services/leadService';
import { 
  BOARD_TYPE, 
  CLASS_LEAD_STATUS, 
  TEACHING_MODE, 
  LEAD_SOURCE, 
  PREFERRED_TUTOR_GENDER 
} from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/ys-final';

async function connect() {
  await mongoose.connect(uri);
  console.log('[seedRequestedLeads] Connected to MongoDB');
}

async function main() {
  await connect();

  const creator = await User.findOne({ role: { $in: ['ADMIN', 'MANAGER'] } });
  if (!creator) {
    console.error('[seedRequestedLeads] No ADMIN or MANAGER found in the database.');
    return;
  }

  console.log(`[seedRequestedLeads] Using creator: ${creator.name} (${creator.role})`);

  // 1. Seed SINGLE Lead
  const singleLeadName = 'Alice Wonderland';
  const singleLeadId = generateLeadId(singleLeadName, 'SINGLE', TEACHING_MODE.ONLINE);
  
  const singleLeadData = {
    leadId: singleLeadId,
    studentType: 'SINGLE',
    studentName: singleLeadName,
    studentGender: 'F',
    parentName: 'Queen of Hearts',
    parentEmail: 'queen.hearts@example.com',
    parentPhone: '9998887770',
    grade: '9th',
    subject: ['English', 'Literature'],
    board: BOARD_TYPE.ICSE,
    mode: TEACHING_MODE.ONLINE,
    location: 'Wonderland',
    city: 'Dream City',
    area: 'Rabbit Hole',
    address: 'Teaparty Lane, Near Mushroom',
    timing: 'Morning, 10:00 AM - 11:30 AM',
    status: CLASS_LEAD_STATUS.NEW,
    classesPerMonth: 12,
    classDurationHours: 1,
    paymentAmount: 8000,
    tutorFees: 6000,
    preferredTutorGender: PREFERRED_TUTOR_GENDER.FEMALE,
    leadSource: LEAD_SOURCE.REFERRED,
    createdBy: creator._id,
    notes: 'Premium single student lead for English literature.',
  };

  const singleLead = await ClassLead.findOneAndUpdate(
    { studentName: singleLeadName, studentType: 'SINGLE' },
    singleLeadData,
    { upsert: true, new: true }
  );
  console.log(`[seedRequestedLeads] Upserted SINGLE lead: ${singleLead.studentName} (${singleLead.leadId})`);

  // 2. Seed GROUP Lead
  const groupLeadName = 'Science Squad';
  const groupLeadId = generateLeadId(groupLeadName, 'GROUP', TEACHING_MODE.OFFLINE);

  const groupLeadData = {
    leadId: groupLeadId,
    studentType: 'GROUP',
    studentName: groupLeadName,
    numberOfStudents: 2,
    grade: '10th',
    subject: ['Physics', 'Chemistry'],
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.OFFLINE,
    location: 'Labs',
    city: 'Science City',
    area: 'Newton Square',
    address: 'Chemistry Building, Floor 2',
    timing: 'Evening, 4:00 PM - 6:00 PM',
    status: CLASS_LEAD_STATUS.NEW,
    classesPerMonth: 10,
    classDurationHours: 2,
    paymentAmount: 15000,
    tutorFees: 10000,
    preferredTutorGender: PREFERRED_TUTOR_GENDER.MALE,
    leadSource: LEAD_SOURCE.WHATSAPP,
    createdBy: creator._id,
    notes: 'Group lead for two students preparing for board exams.',
    studentDetails: [
      {
        name: 'Bob Builder',
        gender: 'M',
        fees: 7500,
        tutorFees: 5000,
        parentName: 'Mrs. Builder',
        parentEmail: 'mrs.builder@example.com',
        parentPhone: '8887776660',
        board: BOARD_TYPE.CBSE,
        grade: '10th',
        subject: ['Physics', 'Chemistry']
      },
      {
        name: 'Charlie Brown',
        gender: 'M',
        fees: 7500,
        tutorFees: 5000,
        parentName: 'Mr. Brown',
        parentEmail: 'mr.brown@example.com',
        parentPhone: '7776665550',
        board: BOARD_TYPE.CBSE,
        grade: '10th',
        subject: ['Physics', 'Chemistry']
      }
    ]
  };

  const groupLead = await ClassLead.findOneAndUpdate(
    { studentName: groupLeadName, studentType: 'GROUP' },
    groupLeadData,
    { upsert: true, new: true }
  );
  console.log(`[seedRequestedLeads] Upserted GROUP lead: ${groupLead.studentName} (${groupLead.leadId})`);

  // Create Groupleads record if it doesn't exist
  let groupleads = await Groupleads.findOne({ classLead: groupLead._id });
  if (!groupleads) {
    groupleads = new Groupleads({
      classLead: groupLead._id,
      students: groupLeadData.studentDetails,
      grade: groupLeadData.grade,
      board: groupLeadData.board,
    });
    await groupleads.save();
    groupLead.groupClass = groupleads._id as any;
    await groupLead.save();
    console.log(`[seedRequestedLeads] Created Groupleads for lead: ${groupLead.studentName}`);
  }

}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error('[seedRequestedLeads] Failed', e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
