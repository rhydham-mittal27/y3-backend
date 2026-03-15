
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Option from '../models/Option';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const verify = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`Connected to: ${conn.connection.host}`);
    
    const cities = ['BHOPAL', 'INDORE'];
    
    for (const cityCode of cities) {
      const city = await Option.findOne({ type: 'CITY', value: cityCode });
      if (city) {
        const type = `AREA_${cityCode}`;
        const areas = await Option.find({ type, parent: city._id }).sort({ sortOrder: 1 });
        console.log(`City: ${cityCode}`);
        console.log(`Total Areas: ${areas.length}`);
        if (areas.length > 0) {
          console.log(`First 3: ${areas.slice(0, 3).map(a => a.label).join(', ')}`);
          console.log(`Last 3: ${areas.slice(-3).map(a => a.label).join(', ')}`);
        }
        console.log('---');
      } else {
        console.log(`City ${cityCode} not found`);
      }
    }
  } catch (err) {
    console.error('Verification error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

verify();
