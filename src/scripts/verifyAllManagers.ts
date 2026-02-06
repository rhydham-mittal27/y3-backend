import mongoose from 'mongoose';
import { config } from 'dotenv';
import Manager from '../models/Manager';

config();

/**
 * Script to bulk verify all existing managers in the database
 * This sets verificationStatus to 'VERIFIED' and sets verifiedAt timestamp
 */
async function verifyAllManagers() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || '');
    console.log('✅ Connected to MongoDB\n');

    // Get all managers
    const managers = await Manager.find({});
    console.log(`📊 Found ${managers.length} manager(s) in database\n`);

    if (managers.length === 0) {
      console.log('No managers to update.');
      await mongoose.connection.close();
      return;
    }

    // Count managers by status before update
    const statusCounts = managers.reduce((acc, mgr) => {
      const status = mgr.verificationStatus || 'PENDING';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('Current verification status distribution:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
    console.log('');

    // Update all managers to VERIFIED
    console.log('🔄 Updating all managers to VERIFIED status...');
    
    const updateResult = await Manager.updateMany(
      {}, // Update all managers
      {
        $set: {
          verificationStatus: 'VERIFIED',
          verifiedAt: new Date(),
        }
      }
    );

    console.log(`✅ Updated ${updateResult.modifiedCount} manager(s)\n`);

    // Verify the update
    const verifiedManagers = await Manager.find({ verificationStatus: 'VERIFIED' });
    console.log(`✅ Verification complete: ${verifiedManagers.length}/${managers.length} managers are now VERIFIED\n`);

    // Show sample of updated managers
    console.log('Sample of updated managers:');
    const sampleManagers = await Manager.find({ verificationStatus: 'VERIFIED' })
      .limit(5)
      .populate('user', 'name email')
      .select('user verificationStatus verifiedAt');

    sampleManagers.forEach((mgr: any, idx) => {
      console.log(`  ${idx + 1}. ${mgr.user?.name || 'Unknown'} (${mgr.user?.email || 'No email'})`);
      console.log(`     Status: ${mgr.verificationStatus}`);
      console.log(`     Verified At: ${mgr.verifiedAt?.toISOString() || 'N/A'}`);
    });

    console.log('\n✨ All managers have been verified successfully!');
    console.log('Note: Frontend verification flow remains unchanged for new managers.');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the script
verifyAllManagers();
