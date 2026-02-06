import mongoose from 'mongoose';
import { config } from 'dotenv';
import Manager from '../models/Manager';

config();

async function checkManagerStatus() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    const managers = await Manager.find({})
      .populate('user', 'name email')
      .select('user verificationStatus verifiedAt');

    console.log(`\nTotal Managers: ${managers.length}\n`);
    
    managers.forEach((mgr: any, idx) => {
      console.log(`${idx + 1}. ${mgr.user?.name || 'Unknown'}`);
      console.log(`   Email: ${mgr.user?.email || 'N/A'}`);
      console.log(`   Status: ${mgr.verificationStatus}`);
      console.log(`   Verified At: ${mgr.verifiedAt?.toISOString() || 'N/A'}\n`);
    });

    const statusCounts = managers.reduce((acc, mgr) => {
      const status = mgr.verificationStatus || 'PENDING';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('Status Summary:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    await mongoose.connection.close();
  } catch (error: any) {
    console.error('Error:', error.message);
    await mongoose.connection.close();
  }
}

checkManagerStatus();
