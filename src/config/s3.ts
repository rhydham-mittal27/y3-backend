import { S3Client } from '@aws-sdk/client-s3';
import { config } from 'dotenv';

config();

// Initialize S3 Client
export const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// S3 Configuration
export const S3_CONFIG = {
  BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME || 'yourshikshak-uploads',
  FOLDER_PREFIX: process.env.AWS_S3_FOLDER_PREFIX || 'production',
  REGION: process.env.AWS_REGION || 'us-east-1',
  PRESIGNED_URL_EXPIRY: 3600, // 1 hour in seconds
  FOLDERS: {
    DOCUMENTS: 'documents',
    TEST_PAPERS: 'test-papers',
    ANSWER_SHEETS: 'answer-sheets',
    NOTES: 'notes',
    PROFILE_PHOTOS: 'profile-photos',
  },
};

export default s3Client;
