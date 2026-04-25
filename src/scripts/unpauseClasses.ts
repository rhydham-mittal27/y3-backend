import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found in environment');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const result = await mongoose.connection.collection('finalclasses').updateMany(
      { status: 'PAUSED' },
      { $set: { status: 'ACTIVE' } }
    );

    console.log('Update Result:', {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('Error during update:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();
