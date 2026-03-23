import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, S3_CONFIG } from '../config/s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const guessContentTypeFromKey = (key: string): string | undefined => {
  const ext = (path.extname(key || '') || '').toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return undefined;
};

export type S3EntityType = 'students' | 'tutors' | 'classes' | 'coordinators' | 'managers' | 'tests' | 'notes' | 'payments' | 'users';

/**
 * Generate a unique filename for S3 storage
 */
export const generateUniqueFilename = (originalName: string): string => {
  const ext = path.extname(originalName);
  const nameWithoutExt = path.basename(originalName, ext);
  const sanitized = nameWithoutExt.replace(/[^a-zA-Z0-9-_]/g, '-');
  const timestamp = Date.now();
  const uniqueId = uuidv4().split('-')[0];
  return `${sanitized}-${timestamp}-${uniqueId}${ext}`;
};

export const getPublicUrlForKey = (key: string): string => {
  return `https://${S3_CONFIG.BUCKET_NAME}.s3.${S3_CONFIG.REGION}.amazonaws.com/${key}`;
};

export const buildStructuredS3Key = (args: {
  entityType: S3EntityType;
  entityId: string;
  folder: string;
  filename: string;
}): string => {
  const uniqueFilename = generateUniqueFilename(args.filename);
  const safeEntityId = String(args.entityId).trim();
  const safeFolder = String(args.folder).replace(/^\/+|\/+$/g, '');
  return `${S3_CONFIG.FOLDER_PREFIX}/${args.entityType}/${safeEntityId}/${safeFolder}/${uniqueFilename}`;
};

export const uploadFileToS3Structured = async (
  buffer: Buffer,
  filename: string,
  mimetype: string,
  args: { entityType: S3EntityType; entityId: string; folder: string }
): Promise<{ key: string; url: string; bucket: string }> => {
  const key = buildStructuredS3Key({
    entityType: args.entityType,
    entityId: args.entityId,
    folder: args.folder,
    filename,
  });

  try {
    const command = new PutObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    });

    await s3Client.send(command);

    const url = getPublicUrlForKey(key);

    return {
      key,
      url,
      bucket: S3_CONFIG.BUCKET_NAME,
    };
  } catch (error: any) {
    console.error('[S3Service] Upload failed:', error);
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
};

export const getObjectFromS3 = async (key: string) => {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
    });
    return await s3Client.send(command);
  } catch (error: any) {
    console.error('[S3Service] Failed to fetch object:', key, error);
    throw new Error(`Failed to fetch object from S3: ${error.message}`);
  }
};

/**
 * Upload a file to S3
 * @param buffer - File buffer
 * @param filename - Original filename
 * @param mimetype - File MIME type
 * @param folder - S3 folder (e.g., 'documents', 'test-papers')
 * @returns Object with S3 key and public URL
 */
export const uploadFileToS3 = async (
  buffer: Buffer,
  filename: string,
  mimetype: string,
  folder: string
): Promise<{ key: string; url: string; bucket: string }> => {
  try {
    const uniqueFilename = generateUniqueFilename(filename);
    const key = `${S3_CONFIG.FOLDER_PREFIX}/${folder}/${uniqueFilename}`;

    const command = new PutObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      // ServerSideEncryption: 'AES256', // Enable encryption
    });

    await s3Client.send(command);

    // Generate public URL (for public buckets) or use presigned URL for private buckets
    const url = getPublicUrlForKey(key);

    return {
      key,
      url,
      bucket: S3_CONFIG.BUCKET_NAME,
    };
  } catch (error: any) {
    console.error('[S3Service] Upload failed:', error);
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
};

/**
 * Delete a file from S3
 * @param key - S3 object key
 */
export const deleteFileFromS3 = async (key: string): Promise<void> => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    console.log(`[S3Service] File deleted successfully: ${key}`);
  } catch (error: any) {
    console.error('[S3Service] Delete failed:', error);
    throw new Error(`Failed to delete file from S3: ${error.message}`);
  }
};

/**
 * Generate a presigned URL for secure file access
 * @param key - S3 object key
 * @param expiresIn - URL expiry time in seconds (default: 1 hour)
 * @returns Presigned URL
 */
export const getPresignedUrl = async (
  key: string,
  expiresIn: number = S3_CONFIG.PRESIGNED_URL_EXPIRY
): Promise<string> => {
  try {
    const contentType = guessContentTypeFromKey(key);
    const command = new GetObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: 'inline',
      ...(contentType ? { ResponseContentType: contentType } : {}),
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error: any) {
    console.error('[S3Service] Failed to generate presigned URL:', error);
    throw new Error(`Failed to generate presigned URL: ${error.message}`);
  }
};

/**
 * Check if a file exists in S3
 * @param key - S3 object key
 * @returns boolean
 */
export const fileExistsInS3 = async (key: string): Promise<boolean> => {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
};

/**
 * Resolves an S3 key or URL into a signed URL for secure access.
 * If the value is already a URL from our S3 bucket, it extracts the key and signs it.
 */
export const resolveS3DocumentUrl = async (val: any): Promise<any> => {
  if (typeof val !== 'string' || val.trim().length === 0) return val;

  // If it's a data URL or blob, return as is
  if (/^data:/i.test(val) || /^blob:/i.test(val)) return val;

  let key = val.trim();

  // If it's a full URL, attempt to extract the key if it's from our bucket
  if (/^https?:\/\//i.test(key)) {
    try {
      const url = new URL(key);
      const bucketName = S3_CONFIG.BUCKET_NAME;

      // Check if it matches virtual-host style or path-style S3 URLs for our bucket
      const isOurBucket =
        url.hostname.includes(`${bucketName}.s3`) ||
        url.pathname.startsWith(`/${bucketName}/`);

      if (isOurBucket) {
        if (url.hostname.startsWith(bucketName)) {
          // Virtual-host style: bucket.s3.region.amazonaws.com/key
          key = url.pathname.substring(1); // Remove leading slash
        } else {
          // Path-style or other: s3.region.amazonaws.com/bucket/key
          const parts = url.pathname.split('/').filter(Boolean);
          if (parts[0] === bucketName) {
            key = parts.slice(1).join('/');
          }
        }
        // Remove any query parameters (like previous signatures)
        key = key.split('?')[0];
      } else {
        // Not our bucket, return as is
        return val;
      }
    } catch (e) {
      // Invalid URL, return as is
      return val;
    }
  }

  try {
    return await getPresignedUrl(key);
  } catch (error: any) {
    return getPublicUrlForKey(key);
  }
};

export default {
  uploadFileToS3,
  uploadFileToS3Structured,
  deleteFileFromS3,
  getPresignedUrl,
  getObjectFromS3,
  fileExistsInS3,
  generateUniqueFilename,
  buildStructuredS3Key,
  getPublicUrlForKey,
  resolveS3DocumentUrl,
};
