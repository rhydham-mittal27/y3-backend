import fs from 'fs';
import path from 'path';
import logger from './logger';

export const deleteFile = async (filePath: string): Promise<void> => {
  try {
     if (fs.existsSync(filePath)) {
       await fs.promises.unlink(filePath);
       logger.info(`Deleted file: ${filePath}`);
     }
  } catch (err) {
     logger.error(`Failed to delete file ${filePath}: ${(err as Error).message}`);
  }
};

export const getFileUrl = (filename: string): string => {
  return `/uploads/documents/${filename}`;
};

export const validateFileExists = (filePath: string): boolean => {
  return fs.existsSync(filePath);
};

export const getFileExtension = (filename: string): string => {
  return path.extname(filename).toLowerCase();
};
