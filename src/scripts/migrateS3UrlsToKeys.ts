import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/database';
import { S3_CONFIG } from '../config/s3';

const DRY_RUN = process.env.DRY_RUN !== 'false';

const isHttpUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//i.test(v);

const isLikelyS3Key = (key: string): boolean => {
  if (!key) return false;
  if (key.startsWith(`${S3_CONFIG.FOLDER_PREFIX}/`)) return true;
  if (key.startsWith('uploads/')) return true;
  if (key.startsWith(`${S3_CONFIG.FOLDERS.DOCUMENTS}/`)) return true;
  if (key.startsWith(`${S3_CONFIG.FOLDERS.TEST_PAPERS}/`)) return true;
  if (key.startsWith(`${S3_CONFIG.FOLDERS.ANSWER_SHEETS}/`)) return true;
  if (key.startsWith(`${S3_CONFIG.FOLDERS.NOTES}/`)) return true;
  if (key.startsWith(`${S3_CONFIG.FOLDERS.PROFILE_PHOTOS}/`)) return true;
  if (key.startsWith('tutors/') || key.startsWith('students/') || key.startsWith('classes/') || key.startsWith('users/')) return true;
  return false;
};

const urlToKey = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.trim().length === 0) return null;

  // Already a key
  if (!isHttpUrl(value)) return value;

  try {
    const u = new URL(value);

    // Extract path without leading slash
    let key = decodeURIComponent(u.pathname.replace(/^\//, ''));
    if (!key) return value;

    // Handle S3 path-style: https://s3.<region>.amazonaws.com/<bucket>/<key>
    const parts = key.split('/').filter(Boolean);
    if (parts.length > 1 && parts[0] === S3_CONFIG.BUCKET_NAME) {
      key = parts.slice(1).join('/');
    }

    // Only treat as convertible if it looks like one of our keys
    if (!isLikelyS3Key(key)) {
      return value;
    }

    return key;
  } catch {
    return value;
  }
};

const shouldConvert = (val: unknown): boolean => {
  if (typeof val !== 'string' || val.trim().length === 0) return false;
  if (!isHttpUrl(val)) return false;
  const key = urlToKey(val);
  if (!key) return false;
  return key !== val;
};

const looksLikeKey = (val: unknown): boolean => {
  return typeof val === 'string' && val.startsWith(`${S3_CONFIG.FOLDER_PREFIX}/`);
};

async function migrateTutors() {
  const Tutor = mongoose.models.Tutor || require('../models/Tutor').default;

  const tutors = await Tutor.find({
    $or: [
      { 'documents.documentUrl': { $regex: '^https?://', $options: 'i' } },
      { verificationFeePaymentProof: { $regex: '^https?://', $options: 'i' } },
    ],
  }).select('_id documents verificationFeePaymentProof');

  let changed = 0;

  for (const t of tutors) {
    let dirty = false;

    const nextDocs = Array.isArray(t.documents)
      ? t.documents.map((d: any) => {
          const out = { ...d };
          if (shouldConvert(out.documentUrl)) {
            const k = urlToKey(out.documentUrl);
            if (k && k !== out.documentUrl) {
              out.documentUrl = k;
              dirty = true;
            }
          }
          // Backfill s3Key if missing
          if (!out.s3Key && looksLikeKey(out.documentUrl)) {
            out.s3Key = out.documentUrl;
            dirty = true;
          }
          return out;
        })
      : t.documents;

    let nextFeeProof = t.verificationFeePaymentProof;
    if (shouldConvert(nextFeeProof)) {
      const k = urlToKey(nextFeeProof);
      if (k && k !== nextFeeProof) {
        nextFeeProof = k;
        dirty = true;
      }
    }

    if (dirty) {
      changed += 1;
      if (!DRY_RUN) {
        await Tutor.updateOne(
          { _id: t._id },
          {
            $set: {
              documents: nextDocs,
              verificationFeePaymentProof: nextFeeProof,
            },
          }
        );
      }
    }
  }

  return { checked: tutors.length, changed };
}

async function migrateCoordinators() {
  const Coordinator = mongoose.models.Coordinator || require('../models/Coordinator').default;

  const items = await Coordinator.find({ 'documents.documentUrl': { $regex: '^https?://', $options: 'i' } }).select(
    '_id documents'
  );

  let changed = 0;
  for (const c of items) {
    let dirty = false;
    const nextDocs = Array.isArray(c.documents)
      ? c.documents.map((d: any) => {
          const out = { ...d };
          if (shouldConvert(out.documentUrl)) {
            const k = urlToKey(out.documentUrl);
            if (k && k !== out.documentUrl) {
              out.documentUrl = k;
              dirty = true;
            }
          }
          if (!out.s3Key && looksLikeKey(out.documentUrl)) {
            out.s3Key = out.documentUrl;
            dirty = true;
          }
          return out;
        })
      : c.documents;

    if (dirty) {
      changed += 1;
      if (!DRY_RUN) {
        await Coordinator.updateOne({ _id: c._id }, { $set: { documents: nextDocs } });
      }
    }
  }

  return { checked: items.length, changed };
}

async function migrateManagers() {
  const Manager = mongoose.models.Manager || require('../models/Manager').default;

  const items = await Manager.find({ 'documents.documentUrl': { $regex: '^https?://', $options: 'i' } }).select('_id documents');

  let changed = 0;
  for (const m of items) {
    let dirty = false;
    const nextDocs = Array.isArray(m.documents)
      ? m.documents.map((d: any) => {
          const out = { ...d };
          if (shouldConvert(out.documentUrl)) {
            const k = urlToKey(out.documentUrl);
            if (k && k !== out.documentUrl) {
              out.documentUrl = k;
              dirty = true;
            }
          }
          if (!out.s3Key && looksLikeKey(out.documentUrl)) {
            out.s3Key = out.documentUrl;
            dirty = true;
          }
          return out;
        })
      : m.documents;

    if (dirty) {
      changed += 1;
      if (!DRY_RUN) {
        await Manager.updateOne({ _id: m._id }, { $set: { documents: nextDocs } });
      }
    }
  }

  return { checked: items.length, changed };
}

async function migrateTests() {
  const Test = mongoose.models.Test || require('../models/Test').default;

  const items = await Test.find({
    $or: [
      { paperUrl: { $regex: '^https?://', $options: 'i' } },
      { answerSheetUrl: { $regex: '^https?://', $options: 'i' } },
    ],
  }).select('_id paperUrl answerSheetUrl paperS3Key answerSheetS3Key');

  let changed = 0;
  for (const t of items) {
    let dirty = false;
    let nextPaper = t.paperUrl;
    let nextAnswer = t.answerSheetUrl;

    if (shouldConvert(nextPaper)) {
      const k = urlToKey(nextPaper);
      if (k && k !== nextPaper) {
        nextPaper = k;
        dirty = true;
      }
    }

    if (shouldConvert(nextAnswer)) {
      const k = urlToKey(nextAnswer);
      if (k && k !== nextAnswer) {
        nextAnswer = k;
        dirty = true;
      }
    }

    const update: any = {};
    if (nextPaper !== t.paperUrl) update.paperUrl = nextPaper;
    if (nextAnswer !== t.answerSheetUrl) update.answerSheetUrl = nextAnswer;

    if (!t.paperS3Key && looksLikeKey(nextPaper)) {
      update.paperS3Key = nextPaper;
      dirty = true;
    }

    if (!t.answerSheetS3Key && looksLikeKey(nextAnswer)) {
      update.answerSheetS3Key = nextAnswer;
      dirty = true;
    }

    if (dirty) {
      changed += 1;
      if (!DRY_RUN) {
        await Test.updateOne({ _id: t._id }, { $set: update });
      }
    }
  }

  return { checked: items.length, changed };
}

async function migrateNotes() {
  const Note = mongoose.models.Note || require('../models/Note').default;

  const items = await Note.find({ url: { $regex: '^https?://', $options: 'i' } }).select('_id url s3Key');

  let changed = 0;
  for (const n of items) {
    const nextUrl = urlToKey(n.url);
    const update: any = {};
    let dirty = false;

    if (nextUrl && nextUrl !== n.url) {
      update.url = nextUrl;
      dirty = true;
    }

    if (!n.s3Key && looksLikeKey(nextUrl)) {
      update.s3Key = nextUrl;
      dirty = true;
    }

    if (dirty) {
      changed += 1;
      if (!DRY_RUN) {
        await Note.updateOne({ _id: n._id }, { $set: update });
      }
    }
  }

  return { checked: items.length, changed };
}

async function migratePayments() {
  const Payment = mongoose.models.Payment || require('../models/Payment').default;

  const items = await Payment.find({ paymentProof: { $regex: '^https?://', $options: 'i' } }).select('_id paymentProof');

  let changed = 0;
  for (const p of items) {
    const next = urlToKey(p.paymentProof);
    if (next && next !== p.paymentProof) {
      changed += 1;
      if (!DRY_RUN) {
        await Payment.updateOne({ _id: p._id }, { $set: { paymentProof: next } });
      }
    }
  }

  return { checked: items.length, changed };
}

async function main() {
  await connectDB();

  console.log('[migrateS3UrlsToKeys] starting', {
    dryRun: DRY_RUN,
    bucket: S3_CONFIG.BUCKET_NAME,
    prefix: S3_CONFIG.FOLDER_PREFIX,
  });

  const results = {
    tutors: await migrateTutors(),
    coordinators: await migrateCoordinators(),
    managers: await migrateManagers(),
    tests: await migrateTests(),
    notes: await migrateNotes(),
    payments: await migratePayments(),
  };

  console.log('[migrateS3UrlsToKeys] results', results);

  if (DRY_RUN) {
    console.log('[migrateS3UrlsToKeys] DRY_RUN enabled, no writes were made. Set DRY_RUN=false to apply.');
  }

  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[migrateS3UrlsToKeys] failed', err);
  process.exit(1);
});
