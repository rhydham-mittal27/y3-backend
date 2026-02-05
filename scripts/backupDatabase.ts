/**
 * Database Backup Script
 * Creates automated backups of MongoDB database
 * 
 * Usage:
 *   npm run backup:db              # Manual backup
 *   npm run backup:db -- --auto    # Automated backup (for cron)
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { logInfo, logError } from '../src/utils/logger';

dotenv.config();

const execAsync = promisify(exec);

interface BackupOptions {
  auto?: boolean;
  retentionDays?: number;
}

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const RETENTION_DAYS = 7; // Keep backups for 7 days by default

/**
 * Ensure backup directory exists
 */
const ensureBackupDir = () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
};

/**
 * Get database name from MongoDB URI
 */
const getDatabaseName = (uri: string): string => {
  const match = uri.match(/\/([^/?]+)(\?|$)/);
  return match ? match[1] : 'your-shikshak';
};

/**
 * Create backup filename with timestamp
 */
const getBackupFilename = (dbName: string): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${dbName}-backup-${timestamp}`;
};

/**
 * Create MongoDB backup using mongodump
 */
const createBackup = async (uri: string, dbName: string, filename: string): Promise<string> => {
  const backupPath = path.join(BACKUP_DIR, filename);
  const command = `mongodump --uri="${uri}" --out="${backupPath}" --db="${dbName}"`;

  try {
    await execAsync(command);
    logInfo(`Database backup created: ${backupPath}`);
    return backupPath;
  } catch (error: any) {
    logError(`Backup failed: ${error.message}`);
    throw error;
  }
};

/**
 * Compress backup directory
 */
const compressBackup = async (backupPath: string): Promise<string> => {
  const archivePath = `${backupPath}.tar.gz`;
  const command = `tar -czf "${archivePath}" -C "${path.dirname(backupPath)}" "${path.basename(backupPath)}"`;

  try {
    await execAsync(command);
    // Remove uncompressed backup
    fs.rmSync(backupPath, { recursive: true, force: true });
    logInfo(`Backup compressed: ${archivePath}`);
    return archivePath;
  } catch (error: any) {
    logError(`Compression failed: ${error.message}`);
    throw error;
  }
};

/**
 * Clean old backups based on retention policy
 */
const cleanOldBackups = (retentionDays: number) => {
  const files = fs.readdirSync(BACKUP_DIR);
  const now = Date.now();
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

  files.forEach((file) => {
    const filePath = path.join(BACKUP_DIR, file);
    const stats = fs.statSync(filePath);
    const age = now - stats.mtimeMs;

    if (age > retentionMs) {
      fs.unlinkSync(filePath);
      logInfo(`Deleted old backup: ${file}`);
    }
  });
};

/**
 * Main backup function
 */
const backupDatabase = async (options: BackupOptions = {}) => {
  try {
    const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
    if (!uri) {
      throw new Error('MONGODB_URI or DATABASE_URL not set in environment variables');
    }

    ensureBackupDir();

    const dbName = getDatabaseName(uri);
    const filename = getBackupFilename(dbName);
    const retentionDays = options.retentionDays || RETENTION_DAYS;

    logInfo(`Starting database backup for: ${dbName}`);

    // Create backup
    const backupPath = await createBackup(uri, dbName, filename);

    // Compress backup
    const archivePath = await compressBackup(backupPath);

    // Clean old backups
    cleanOldBackups(retentionDays);

    const stats = fs.statSync(archivePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    logInfo(`Backup completed successfully: ${archivePath} (${sizeMB} MB)`);

    if (!options.auto) {
      console.log(`\n✅ Backup created: ${archivePath}`);
      console.log(`📦 Size: ${sizeMB} MB`);
    }

    return archivePath;
  } catch (error: any) {
    logError(`Database backup failed: ${error.message}`);
    if (!options.auto) {
      console.error(`\n❌ Backup failed: ${error.message}`);
    }
    process.exit(1);
  }
};

// Run if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: BackupOptions = {
    auto: args.includes('--auto'),
    retentionDays: args.includes('--retention') 
      ? parseInt(args[args.indexOf('--retention') + 1]) 
      : undefined,
  };

  backupDatabase(options)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default backupDatabase;