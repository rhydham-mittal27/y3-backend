import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Option from '../models/Option';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const seedLeadSources = async () => {
  await connectDB();

  const sources = [
    { value: 'GOOGLE_SEARCH', label: 'Google Search' },
    { value: 'FACEBOOK', label: 'Facebook' },
    { value: 'INSTAGRAM', label: 'Instagram' },
    { value: 'JUSTDIAL', label: 'JustDial' },
    { value: 'SULEKHA', label: 'Sulekha' },
    { value: 'WORD_OF_MOUTH', label: 'Word of Mouth' },
    { value: 'WALK_IN', label: 'Direct Walk-in' },
    { value: 'WEBSITE', label: 'Website' },
    { value: 'GOOGLE_ADS', label: 'Google Ads' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'REFERRED', label: 'Referred' },
    { value: 'OTHER', label: 'Other' },
  ];

  try {
    console.log(`Seeding LEAD_SOURCE...`);
    for (const [index, source] of sources.entries()) {
      await Option.findOneAndUpdate(
        { type: 'LEAD_SOURCE', value: source.value },
        {
          type: 'LEAD_SOURCE',
          value: source.value,
          label: source.label,
          isActive: true,
          sortOrder: index + 1
        },
        { upsert: true, new: true }
      );
    }
    console.log('✅ Lead sources seeded successfully');
  } catch (error) {
    console.error('Error seeding options:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

seedLeadSources();
