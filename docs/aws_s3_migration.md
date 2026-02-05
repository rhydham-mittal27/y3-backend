# Using AWS S3 as an Alternative to Cloudinary

This guide outlines the steps required to replace Cloudinary with AWS S3 for document and file storage in the Your Shikshak backend.

## Prerequisites
1. **AWS Account**: An active account with access to S3 and IAM.
2. **S3 Bucket**: Create a bucket (e.g., `yourshikshak-storage`) and note the region.
3. **IAM User**: Create an IAM user with `AmazonS3FullAccess` (or a custom policy scoped to your bucket) and generate an **Access Key ID** and **Secret Access Key**.

---

## 1. Environment Configuration
Add the following variables to your `.env` file and remove/deprecate Cloudinary-related variables.

```env
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=ap-south-1
AWS_S3_BUCKET=yourshikshak-storage
```

---

## 2. Install Dependencies
Install the AWS SDK v3 packages:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
```

---

## 3. Implementation Steps

### A. S3 Configuration
Create a new config file `backend/src/config/s3.ts`:

```typescript
import { S3Client } from '@aws-sdk/client-s3';

export const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
});

export const S3_BUCKET = process.env.AWS_S3_BUCKET;
```

### B. Update Upload Logic (e.g., in `tutorService.ts`)
Replace Cloudinary's `upload_stream` with S3's `Upload` helper from `@aws-sdk/lib-storage`.

```typescript
import { Upload } from '@aws-sdk/lib-storage';
import { s3Client, S3_BUCKET } from '../config/s3';

// Inside uploadDocument function
const key = `tutors/${tutorId}/${Date.now()}_${originalname}`;

const parallelUploads3 = new Upload({
  client: s3Client,
  params: {
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: file.mimetype,
  },
});

await parallelUploads3.done();

const doc = {
  documentType,
  documentUrl: `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
  uploadedAt: new Date(),
  publicId: key, // Use S3 Key as publicId for deletion logic
  resourceType: file.mimetype,
};
```

### C. Update Deletion Logic
Replace `cloudinary.uploader.destroy` with `DeleteObjectCommand`.

```typescript
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

// Inside deleteDocument function
if (doc?.publicId) {
  try {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: doc.publicId,
    }));
  } catch (err) {
    console.error('Failed to delete from S3', err);
  }
}
```

---

## 4. Migration Strategy
1. **Parallel Support**: For a transition period, check for `cloudinary` prefixes in URLs. If the URL contains `cloudinary.com`, use the Cloudinary deletion logic; otherwise, use S3.
2. **Bulk Transfer**: Use tools like `rclone` or a custom script to move existing assets from Cloudinary to S3 while preserving the folder structure.
3. **Database Update**: Run a migration script to update `documentUrl` and `publicId` in the `Tutors` and `Tests` collections to point to the new S3 locations.
