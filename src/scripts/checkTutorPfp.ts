import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Tutor from '../models/Tutor';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function checkTutor() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI not found');
    
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const teacherId = 'TMBPLXVUSBX';
    const tutor = await Tutor.findOne({ teacherId }).populate('user');
    
    if (!tutor) {
      console.log(`Tutor ${teacherId} not found`);
    } else {
      console.log('Tutor found:', tutor.teacherId);
      console.log('Documents:', JSON.stringify(tutor.documents, null, 2));
      
      const documents = tutor.documents || [];
      const profilePhoto = documents.find((d: any) => 
        ['PROFILE_PHOTO', 'PROFILE_PHOTOS', 'PROFILE_PICTURE', 'PROFILE_PHOTO_UPLOAD'].includes(String(d.documentType || '').toUpperCase().trim())
      );
      
      if (profilePhoto) {
        console.log('Profile photo found:', profilePhoto);
      } else {
        console.log('No profile photo found in documents. All document types:', 
          documents.map((d: any) => d.documentType).join(', ')
        );
      }
    }
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkTutor();
