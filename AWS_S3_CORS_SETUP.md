# AWS S3 CORS Configuration Guide

## Problem
Profile photos and documents are uploading to S3 successfully, but images are not displaying in the frontend. This is because:
1. The S3 bucket needs CORS (Cross-Origin Resource Sharing) configuration
2. The bucket may need public read access for images

## Solution

### Option 1: Configure CORS + Public Read Access (Recommended for Profile Photos)

#### Step 1: Configure CORS Policy

1. Go to AWS S3 Console: https://s3.console.aws.amazon.com/
2. Click on your bucket: `yourshikshak-production`
3. Go to the **Permissions** tab
4. Scroll down to **Cross-origin resource sharing (CORS)**
5. Click **Edit**
6. Paste this CORS configuration:

```json
[
    {
        "AllowedHeaders": [
            "*"
        ],
        "AllowedMethods": [
            "GET",
            "HEAD"
        ],
        "AllowedOrigins": [
            "http://localhost:3000",
            "http://localhost:5000",
            "https://yourshikshak.in",
            "https://*.yourshikshak.in"
        ],
        "ExposeHeaders": [
            "ETag"
        ],
        "MaxAgeSeconds": 3000
    }
]
```

7. Click **Save changes**

#### Step 2: Make Bucket Publicly Readable (for images only)

1. In the same **Permissions** tab
2. Scroll to **Block public access (bucket settings)**
3. Click **Edit**
4. **Uncheck** "Block all public access"
5. Click **Save changes**
6. Type `confirm` when prompted

#### Step 3: Add Bucket Policy for Public Read

1. Scroll down to **Bucket policy**
2. Click **Edit**
3. Paste this policy (replace `yourshikshak-production` with your bucket name):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::yourshikshak-production/uploads/documents/*"
        },
        {
            "Sid": "PublicReadProfilePhotos",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::yourshikshak-production/uploads/profile-photos/*"
        }
    ]
}
```

4. Click **Save changes**

---

### Option 2: Use Presigned URLs (More Secure, for Private Documents)

If you want to keep documents private and use temporary signed URLs:

#### Backend Changes Required:

**File**: `backend/src/services/tutorService.ts`

Modify the `uploadDocument` function to generate presigned URLs:

```typescript
import { getPresignedUrl } from './s3Service';

// After uploading to S3
const uploadResult = await uploadFileToS3(...);

// Generate presigned URL (expires in 1 hour by default)
const presignedUrl = await getPresignedUrl(uploadResult.key);

const doc = {
  documentType,
  documentUrl: presignedUrl, // Use presigned URL instead of public URL
  uploadedAt: new Date(),
  s3Key: uploadResult.key,
  s3Bucket: uploadResult.bucket,
};
```

**Note**: Presigned URLs expire, so you'll need to regenerate them when fetching tutor data.

---

## Testing

After configuring CORS and bucket permissions:

1. Clear your browser cache
2. Refresh the page
3. Upload a new profile photo
4. The image should now display correctly

## Verification

Test if the S3 URL is accessible:
1. Get the S3 URL from the database (e.g., `https://yourshikshak-production.s3.ap-south-1.amazonaws.com/uploads/documents/...`)
2. Open it in a new browser tab
3. If CORS is configured correctly, the image should load

---

## Recommended Approach

**For Profile Photos**: Use Option 1 (Public Read Access)
- Profile photos are meant to be public
- No need for presigned URLs
- Better performance (no URL regeneration needed)

**For Sensitive Documents** (Aadhar, etc.): Use Option 2 (Presigned URLs)
- Keep documents private
- Generate temporary URLs only when needed
- More secure

---

## Quick Fix (Immediate)

If you want images to work right now:

1. Go to S3 Console → `yourshikshak-production` → Permissions
2. Uncheck "Block all public access"
3. Add the CORS configuration above
4. Add the bucket policy above
5. Done! Images will load immediately.
