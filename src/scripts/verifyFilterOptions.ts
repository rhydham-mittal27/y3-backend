import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import ClassLead from '../models/ClassLead';
import User from '../models/User';
import { getDistinctFilterValues } from '../services/leadService';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

const verify = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('MONGODB_URI is not defined'); 
      return;
    }
    
    await mongoose.connect(mongoUri);
    console.log('Connected to DB');

    const distinctIds = await ClassLead.distinct('createdBy');
    console.log('Distinct CreatedBy IDs raw:', distinctIds);
    console.log('Type of first ID:', typeof distinctIds[0]);

    const userCount = await User.countDocuments();
    console.log('Total Users in DB:', userCount);
    
    if (distinctIds.length > 0) {
        const usersFound = await User.find({ _id: { $in: distinctIds } });
        console.log('Users found matching IDs:', usersFound.length);
        console.log('Users found names:', usersFound.map(u => u.name));
    }

    const filterValues = await getDistinctFilterValues();
    console.log('Filter Values Result:', JSON.stringify(filterValues, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
};

verify();
