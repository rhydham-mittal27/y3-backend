
import mongoose from 'mongoose';
import 'dotenv/config';
import Tutor from './src/models/Tutor';
import User from './src/models/User';

const verify = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
        if (!uri) throw new Error('MONGODB_URI not found');
        
        await mongoose.connect(uri);
        console.log('Connected to DB');

        const tutorCount = await Tutor.countDocuments();
        const userCount = await User.countDocuments({ role: 'TUTOR' });

        console.log('--- Seeding Verification ---');
        console.log('Total Tutors:', tutorCount);
        console.log('Total User (Tutors):', userCount);

        const sampleTutors = await Tutor.find().limit(5).populate('user', 'name email');
        console.log('\nSample Tutors:');
        sampleTutors.forEach(t => {
            const u = t.user as any;
            console.log(`- ${u?.name} (${u?.email}): ${t.teacherId}, Subjects: ${t.subjects.join(', ')}`);
        });

    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
};

verify();
