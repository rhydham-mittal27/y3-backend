
import mongoose from 'mongoose';
import FinalClass from './src/models/FinalClass';
import { FINAL_CLASS_STATUS } from './src/config/constants';
import dotenv from 'dotenv';

dotenv.config();

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to DB');

        const activeCount = await FinalClass.countDocuments({ status: FINAL_CLASS_STATUS.ACTIVE });
        console.log('Active Classes Limit:', activeCount);

        const activeClasses = await FinalClass.find({ status: FINAL_CLASS_STATUS.ACTIVE }).select('parentFees status');
        console.log('Sample Active Classes:', activeClasses.slice(0, 5));
        
        const totalFees = activeClasses.reduce((sum, c: any) => sum + (c.parentFees || 0), 0);
        const avg = activeCount ? totalFees / activeCount : 0;
        console.log('Calculated Average:', avg);
        
        const allCount = await FinalClass.countDocuments({});
        console.log('Total Classes:', allCount);

    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
};

check();
