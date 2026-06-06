import 'dotenv/config';
import mongoose from 'mongoose';
import ClassLead from '../models/ClassLead';
import User from '../models/User';
import { updateDemoStatus } from '../services/demoService';
import { DEMO_STATUS, USER_ROLES } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

async function main() {
  if (!uri) {
    console.error('Missing MONGODB_URI/DATABASE_URL in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const leadId = '6a20fe6ee2845b5b5946d564';
  const lead = await ClassLead.findById(leadId);
  if (!lead) {
    console.error(`Class lead with ID ${leadId} not found.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Lead details: Name: ${lead.studentName}, Status: ${lead.status}`);
  if (!lead.assignedTutor) {
    console.error('No tutor is assigned to this lead.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const tutorUserId = lead.assignedTutor.toString();
  const tutor = await User.findById(tutorUserId);
  console.log(`Assigned Tutor: ${tutor?.name} (${tutor?.email})`);

  if (!lead.demoDetails) {
    console.error('No demo details exist on this lead.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Current Demo Status: ${lead.demoDetails.demoStatus}`);

  // Modify the demo details to be in the past to bypass the timing check for tutor completion.
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 1); // Yesterday
  
  lead.demoDetails.demoDate = pastDate;
  lead.demoDetails.demoTime = '10:00';
  await lead.save();
  console.log('Updated demo details to yesterday to pass the timing validation.');

  // Find an admin user to perform the admin rejection
  let admin = await User.findOne({ role: 'ADMIN' });
  if (!admin) {
    admin = await User.findOne({ role: 'MANAGER' });
  }
  if (!admin) {
    // Let's find any user that is not a tutor or create a dummy admin
    admin = await User.create({
      name: 'Admin Seeder',
      email: 'admin_seeder@example.com',
      phone: '9898989898',
      password: 'Password123!',
      role: 'ADMIN',
      isActive: true,
    });
    console.log('Created a dummy admin user:', admin.email);
  } else {
    console.log(`Found admin/manager for rejection: ${admin.name} (${admin.email})`);
  }

  // 1. Mark as COMPLETED from Tutor side
  console.log('\nStep 1: Marking demo as COMPLETED from tutor side...');
  const completedLead = await updateDemoStatus(
    leadId,
    DEMO_STATUS.COMPLETED,
    'The student did really well. Understood all topics.',
    undefined,
    tutorUserId,
    USER_ROLES.TUTOR,
    undefined,
    'PRESENT',
    'Introduction to physics',
    '1 hour'
  );
  console.log(`Demo completed. New Lead Status: ${completedLead.status}, Demo Status: ${completedLead.demoDetails?.demoStatus}`);

  // 2. Reject the demo from Admin side
  console.log('\nStep 2: Rejecting demo from admin side...');
  const rejectedLead = await updateDemoStatus(
    leadId,
    DEMO_STATUS.REJECTED,
    undefined,
    'Parent requested a different schedule/tutor.',
    admin._id.toString(),
    USER_ROLES.ADMIN,
  );
  console.log(`Demo rejected. New Lead Status: ${rejectedLead.status}, Demo Status: ${rejectedLead.demoDetails?.demoStatus}`);

  console.log('\n--- Status Processed Successfully ---');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error processing demo status:', err);
  process.exit(1);
});
