const { resolveS3DocumentUrl } = require('./src/services/s3Service');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

async function test() {
    console.log('--- Testing resolveS3DocumentUrl ---');
    
    const testCases = [
        { name: 'Raw relative key', input: 'uploads/tutors/123/documents/profile.png' },
        { name: 'Leading slash key', input: '/uploads/tutors/123/documents/profile.png' },
        { name: 'API Server URL', input: 'https://api.yourshikshak.in/uploads/tutors/123/documents/profile.png' },
        { name: 'Already S3 URL (Hostname starts with bucket)', input: `https://${process.env.AWS_S3_BUCKET_NAME || 'yourshikshak-production'}.s3.ap-south-1.amazonaws.com/uploads/profile.png` },
        { name: 'Generic S3 URL', input: 'https://s3.ap-south-1.amazonaws.com/yourshikshak-production/uploads/profile.png' },
        { name: 'Random External URL', input: 'https://google.com/logo.png' },
        { name: 'Data URL', input: 'data:image/png;base64,123' }
    ];

    for (const tc of testCases) {
        try {
            const output = await resolveS3DocumentUrl(tc.input);
            console.log(`\n[${tc.name}]`);
            console.log(`Input:  ${tc.input}`);
            console.log(`Output: ${output}`);
            
            // Basic validation: should be a full URL unless it's a data URL/external
            if (tc.input.includes('uploads') || tc.input.includes('production')) {
                if (!output.startsWith('https://')) {
                    console.error('FAILED: Should be a full HTTPS URL');
                } else if (!output.includes('s3') && !tc.input.includes('google.com')) {
                     console.error('FAILED: Should be an S3 URL');
                }
            }
        } catch (e) {
            console.error(`Error testing ${tc.name}:`, e.message);
        }
    }
}

test().then(() => process.exit(0));
