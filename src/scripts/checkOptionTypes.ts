import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Option from '../models/Option';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const checkTypes = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const types = await Option.distinct('type');
    console.log('Available Option Types:', types);
    
    // Also check a few examples for each relevant type to see values
    for (const t of types) {
        const sample = await Option.findOne({ type: t }).select('label value');
        console.log(`Sample for ${t}:`, sample);
    }

  } catch (error) {
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
};

checkTypes();
