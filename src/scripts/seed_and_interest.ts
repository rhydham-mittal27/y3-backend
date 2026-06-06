import 'dotenv/config';
import mongoose from 'mongoose';
import ClassLead from '../models/ClassLead';
import Announcement from '../models/Announcement';
import User from '../models/User';
import Tutor from '../models/Tutor';
import Option from '../models/Option';

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
    console.error(`Class lead with ID ${leadId} not found in database.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Found lead: ${lead.studentName || 'unnamed'} (${lead.leadId}), Status: ${lead.status}`);

  // Ensure an announcement exists for this lead
  let announcement = await Announcement.findOne({ classLead: lead._id });
  if (!announcement) {
    console.log('No announcement found, creating one...');
    
    // Find or create a manager/admin user to post the announcement
    let adminUser = await User.findOne({ role: 'ADMIN' });
    if (!adminUser) {
      adminUser = await User.findOne({ role: 'MANAGER' });
    }
    if (!adminUser) {
      // Create a dummy manager
      adminUser = await User.create({
        name: 'Seeder Manager',
        email: 'seed_manager@example.com',
        phone: '9876543210',
        password: 'Password123!',
        role: 'MANAGER',
        isActive: true,
      });
      console.log('Created a dummy manager to post announcement:', adminUser.email);
    }

    announcement = await Announcement.create({
      classLead: lead._id,
      postedBy: adminUser._id,
      postedAt: new Date(),
      isActive: true,
    });
    console.log('Created announcement with ID:', announcement._id);
    
    // Update lead status to ANNOUNCED
    lead.status = 'ANNOUNCED';
    await lead.save();
    console.log('Updated lead status to ANNOUNCED');
  } else {
    console.log('Found existing announcement with ID:', announcement._id);
    // Make sure announcement is active
    if (!announcement.isActive) {
      announcement.isActive = true;
      await announcement.save();
      console.log('Activated the existing announcement');
    }
  }

  // Find some subject Option IDs to associate with tutors
  const subjects = await Option.find({ type: 'SUBJECT', isActive: true }).limit(3);
  const subjectIds = subjects.map(s => s._id);

  // Now seed 3 teachers/tutors
  const tutorsToSeed = [
    {
      name: 'Teacher Albert',
      email: 'albert.tutor@example.com',
      phone: '9100000001',
      password: 'Password123!',
    },
    {
      name: 'Teacher Marie',
      email: 'marie.tutor@example.com',
      phone: '9100000002',
      password: 'Password123!',
    },
    {
      name: 'Teacher Isaac',
      email: 'isaac.tutor@example.com',
      phone: '9100000003',
      password: 'Password123!',
    }
  ];

  console.log('\n--- Seeding Teachers & Expressing Interest ---');
  for (const data of tutorsToSeed) {
    let user = await User.findOne({ email: data.email });
    if (!user) {
      user = await User.create({
        name: data.name,
        email: data.email,
        phone: data.phone,
        password: data.password,
        role: 'TUTOR',
        isActive: true,
        gender: 'OTHER',
      });
      console.log(`Created user for ${data.name} (${data.email})`);
    } else {
      console.log(`User ${data.email} already exists.`);
      // Update password just in case
      user.password = data.password;
      await user.save();
    }

    let tutor = await Tutor.findOne({ user: user._id });
    if (!tutor) {
      tutor = await Tutor.create({
        user: user._id,
        teacherId: `T-SEED-${data.name.split(' ')[1].toUpperCase()}`,
        subjects: subjectIds,
        experienceHours: 120,
        qualifications: ['M.Sc Physics', 'B.Ed'],
        verificationStatus: 'VERIFIED',
        isAvailable: true,
        yearsOfExperience: 5,
        preferredMode: 'HYBRID',
      });
      console.log(`Created tutor profile for ${data.name}`);
    } else {
      console.log(`Tutor profile for ${data.name} already exists.`);
      tutor.verificationStatus = 'VERIFIED';
      tutor.isAvailable = true;
      tutor.subjects = subjectIds;
      await tutor.save();
    }

    // Now express interest in the announcement
    const alreadyInterested = announcement.interestedTutors.some(
      (it) => it.tutor.toString() === user!._id.toString()
    );

    if (!alreadyInterested) {
      announcement.interestedTutors.push({
        tutor: user._id,
        interestedAt: new Date(),
        notes: `Hi, I am interested in teaching this class. I have 5 years of experience in these subjects.`,
      });
      tutor.interestCount = (tutor.interestCount || 0) + 1;
      await tutor.save();
      console.log(`Registered interest for ${data.name} in announcement ${announcement._id}`);
    } else {
      console.log(`${data.name} has already expressed interest in this announcement.`);
    }
  }

  await announcement.save();
  console.log('Saved announcement with updated interested tutors.');

  // Fetch updated counts
  const finalAnnouncement = await Announcement.findById(announcement._id);
  console.log(`Final interest count on announcement: ${finalAnnouncement?.interestedTutors?.length}`);

  console.log('\n--- Seeded Credentials ---');
  tutorsToSeed.forEach(t => {
    console.log(`Email: ${t.email} | Password: ${t.password}`);
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error running seed script:', err);
  process.exit(1);
});
