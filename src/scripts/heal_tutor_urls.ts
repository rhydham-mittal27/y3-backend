import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Force load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'yourshikshak-production';
const REGION = process.env.AWS_REGION || 'ap-south-1';

async function healTutors() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not found in environment');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Define a minimal Tutor model for healing
    const Tutor = mongoose.model('TutorHealer', new mongoose.Schema({
      documents: [{
        documentType: String,
        documentUrl: String,
        s3Key: String,
        s3Bucket: String
      }],
      teacherId: String
    }, { collection: 'tutors' }));

    const tutors = await Tutor.find({ 'documents.0': { $exists: true } });
    console.log(`Found ${tutors.length} tutors with documents`);

    let updatedCount = 0;

    for (const tutor of tutors) {
      let changed = false;
      const docs = tutor.documents || [];

      for (const doc of docs) {
        let url = doc.documentUrl || '';
        let key = doc.s3Key || '';

        // Case 1: documentUrl is relative but should be an S3 key
        if (url && !url.startsWith('http')) {
          if (!key) {
            key = url.replace(/^\//, ''); // Set s3Key to the relative path
            doc.s3Key = key;
          }
          // Normalize documentUrl to a full public S3 URL
          doc.documentUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
          changed = true;
          console.log(`[Tutor ${tutor.teacherId}] Fixed relative URL: ${url} -> ${doc.documentUrl}`);
        }
        
        // Case 2: documentUrl is our API URL (localhost or production) but should be S3
        if (url && (url.includes('api.yourshikshak.in') || url.includes('localhost'))) {
            try {
                const parsed = new URL(url);
                const uploadIdx = parsed.pathname.indexOf('uploads/');
                if (uploadIdx !== -1) {
                    const newKey = parsed.pathname.substring(uploadIdx);
                    if (!key || key !== newKey) {
                        doc.s3Key = newKey;
                        doc.documentUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${newKey}`;
                        changed = true;
                        console.log(`[Tutor ${tutor.teacherId}] Fixed API URL: ${url} -> ${doc.documentUrl}`);
                    }
                }
            } catch (e) {}
        }

        // Case 3: s3Key is missing but we have an S3 URL
        if (!key && url.includes(`${BUCKET_NAME}.s3`)) {
          try {
            const parsed = new URL(url);
            doc.s3Key = parsed.pathname.substring(1).split('?')[0];
            changed = true;
            console.log(`[Tutor ${tutor.teacherId}] Recovered s3Key from URL: ${doc.s3Key}`);
          } catch (e) {}
        }
      }

      if (changed) {
        await tutor.save();
        updatedCount++;
      }
    }

    console.log(`Healed ${updatedCount} tutors.`);
    await mongoose.disconnect();
  } catch (err) {
    console.error('Healing failed:', err);
  }
}

healTutors();
