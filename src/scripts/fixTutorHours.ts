import mongoose from 'mongoose';
import Tutor from '../models/Tutor';
import { updateTutorExperienceAndTier } from '../services/tutorService';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from backend/.env
dotenv.config({ path: path.join(__dirname, '../../.env') });

const fixTutorHours = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/main-db';
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoURI);
        
        console.log('Fetching all tutors...');
        const tutors = await Tutor.find().populate('user', 'name');
        console.log(`Found ${tutors.length} tutors. Starting synchronization...`);

        let updatedCount = 0;

        for (const tutor of tutors) {
            const userId = tutor.user?._id;
            if (!userId) {
                console.log(`[SKIP] Tutor ${tutor._id} has no user reference.`);
                continue;
            }

            const tutorName = (tutor.user as any)?.name || 'Unknown';
            const oldHours = tutor.experienceHours || 0;

            // Use the updated service function to recalculate and save
            await updateTutorExperienceAndTier(userId as any);

            // Fetch again to check new hours
            const updatedTutor = await Tutor.findById(tutor._id);
            const newHours = updatedTutor?.experienceHours || 0;

            if (oldHours !== newHours) {
                console.log(`[FIXED] ${tutorName}: ${oldHours}h -> ${newHours}h`);
                updatedCount++;
            } else {
                console.log(`[OK] ${tutorName}: ${newHours}h (No change)`);
            }
        }

        console.log(`\nSynchronization Complete! Updated ${updatedCount} tutors.`);
        await mongoose.connection.close();
    } catch (err) {
        console.error('Error during synchronization:', err);
        process.exit(1);
    }
};

fixTutorHours();
