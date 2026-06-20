import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger';

const SERVICE_ACCOUNT_PATH = path.resolve(process.cwd(), 'firebase-service-account.json');

if (!admin.apps.length) {
  if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      logger.info('[Firebase] Initialized with service account');
    } catch (err) {
      logger.error('[Firebase] Failed to initialize with service account', { err });
    }
  } else {
    logger.warn('[Firebase] firebase-service-account.json not found — push notifications disabled');
  }
}

export default admin;
