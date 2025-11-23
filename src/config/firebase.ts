import admin, { ServiceAccount } from 'firebase-admin';
import { config } from 'dotenv';

config();

const {
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
} = process.env;

if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  throw new Error(
    'Firebase credentials are not fully configured. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in the environment.'
  );
}

let decodedPrivateKey: string;
try {
  decodedPrivateKey = Buffer.from(FIREBASE_PRIVATE_KEY, 'base64').toString('utf-8');
} catch (err) {
  throw new Error('Failed to decode FIREBASE_PRIVATE_KEY. Ensure it is base64 encoded.');
}

const serviceAccount: ServiceAccount = {
  projectId: FIREBASE_PROJECT_ID,
  clientEmail: FIREBASE_CLIENT_EMAIL,
  privateKey: decodedPrivateKey.replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const firebaseApp = admin.app();
export const firebaseMessaging = admin.messaging();

export default admin;
