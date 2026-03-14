const mongoose = require('mongoose');
require('dotenv').config();

const migrate = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/YSDB';
  console.log(`Connecting to ${mongoURI}...`);

  try {
    await mongoose.connect(mongoURI, {});
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // List collections to be sure
    const collections = await db.listCollections().toArray();
    console.log('Collections in DB:', collections.map(c => c.name));

    const attendanceCollection = db.collection('attendancesheets');
    
    console.log('Searching for "DRAFT" attendance sheets in "attendancesheets" collection...');
    const draftCount = await attendanceCollection.countDocuments({ status: 'DRAFT' });
    console.log(`Found ${draftCount} draft sheets.`);

    if (draftCount > 0) {
      console.log('Updating to "PENDING"...');
      const result = await attendanceCollection.updateMany(
        { status: 'DRAFT' },
        { $set: { status: 'PENDING' } }
      );
      console.log(`Update result: ${JSON.stringify(result)}`);
    } else {
      console.log('No draft sheets found to migrate.');
    }

    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
    process.exit(0);
  }
};

migrate();
