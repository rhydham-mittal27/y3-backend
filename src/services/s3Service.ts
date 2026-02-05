import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, S3_CONFIG } from '../config/s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

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
    const url = `https://${S3_CONFIG.BUCKET_NAME}.s3.${S3_CONFIG.REGION}.amazonaws.com/${key}`;

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
    const command = new GetObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
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

export default {
  uploadFileToS3,
  deleteFileFromS3,
  getPresignedUrl,
  fileExistsInS3,
  generateUniqueFilename,
};
