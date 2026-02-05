import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ClassLead from '../models/ClassLead';

dotenv.config();

// Inline generation logic to avoid heavy service dependencies
const generateLeadId = (
  studentName: string,
  type: 'SINGLE' | 'GROUP',
  mode: string
): string => {
  const nameParts = studentName.trim().toUpperCase().split(' ');
  const firstInitial = nameParts[0]?.[0] || 'X';
  const lastInitial = nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : 'X';
  const initials = `${firstInitial}${lastInitial}`;
  const typeChar = type === 'SINGLE' ? 'S' : 'G';
  const isOnline = mode.toUpperCase().includes('ONLINE');
  const modeChar = isOnline ? '0' : '1';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let randomChars = '';
  for (let i = 0; i < 4; i++) {
    randomChars += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const nums = '0123456789';
  let randomNums = '';
  for (let i = 0; i < 3; i++) {
    randomNums += nums.charAt(Math.floor(Math.random() * nums.length));
  }
  return `L${initials}${typeChar}${modeChar}${randomChars}${randomNums}`;
};

const migrateLeadIds = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/shikshak_v3';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const leads = await ClassLead.find({ leadId: { $exists: false } });
    console.log(`Found ${leads.length} leads without leadId`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const lead of leads) {
      try {
        const studentName = lead.studentName || (lead.studentDetails && lead.studentDetails[0]?.name) || 'Unknown';
        const type = lead.studentType as 'SINGLE' | 'GROUP';
        const mode = lead.mode || 'ONLINE'; // Default if missing

        // Generate ID with retry logic (simplified)
        let unique = false;
        let attempts = 0;
        let newId = '';

        while (!unique && attempts < 10) {
             newId = generateLeadId(studentName, type, mode);
             const existing = await ClassLead.findOne({ leadId: newId });
             if (!existing) unique = true;
             attempts++;
        }

        if (unique) {
            lead.leadId = newId;
            await lead.save();
            updatedCount++;
            process.stdout.write('.');
        } else {
            console.error(`\nFailed to generate unique ID for lead ${lead._id}`);
            errorCount++;
        }

      } catch (err) {
        console.error(`\nError updating lead ${lead._id}:`, err);
        errorCount++;
      }
    }

    console.log(`\nMigration completed.`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Errors: ${errorCount}`);

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

migrateLeadIds();
