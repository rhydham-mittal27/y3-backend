import 'dotenv/config';
import fs from 'fs';
import mongoose from 'mongoose';
import User from '../models/User';
import Tutor from '../models/Tutor';
import { USER_ROLES, TUTOR_TIER, VERIFICATION_STATUS } from '../config/constants';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

type NormalizedTutorRow = {
  user: {
    name: string;
    email: string;
    phone?: string;
    dob?: string | null;
    gender?: 'MALE' | 'FEMALE' | 'OTHER' | string;
    preferredMode?: string;
    role?: string;
    isActive?: boolean;
    acceptedTerms?: boolean;
    acceptedPolicies?: boolean;
  };
  tutor: {
    alternatePhone?: string;
    permanentAddress?: string;
    residentialAddress?: string;
    subjects: string[];
    qualifications?: string[];
    extracurricularActivities?: string[];
    preferredMode?: string;
    preferredLocations?: string[];
    preferredCities?: string[];
    documents?: { documentType: string; documentUrl: string; uploadedAt?: string }[];
    verificationFeePaymentProof?: string;
    yearsOfExperience?: number;
    metadata?: Record<string, any>;
  };
};

function parseMaybeDate(val?: string | null) {
  if (!val) return undefined;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function normalizeDocuments(docs: any[] | undefined) {
  if (!Array.isArray(docs)) return [];
  return docs
    .map((d) => {
      if (!d || typeof d !== 'object') return null;
      const documentType = String(d.documentType || '').trim();
      const documentUrl = String(d.documentUrl || '').trim();
      if (!documentType || !documentUrl) return null;
      const uploadedAt = parseMaybeDate(d.uploadedAt) || new Date();
      return { documentType, documentUrl, uploadedAt };
    })
    .filter(Boolean) as any[];
}

async function connect() {
  if (!uri) throw new Error('Missing MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  console.log('[seedTutorsFromNormalizedJson] Connected to MongoDB');
}

async function upsertTutorUser(row: NormalizedTutorRow, defaultPassword: string) {
  const email = String(row?.user?.email || '').toLowerCase().trim();
  if (!email) return null;

  const existing = await User.findOne({ email });
  if (existing) {
    const patch: any = {};
    if (!existing.name && row.user.name) patch.name = row.user.name;
    if (!existing.phone && row.user.phone) patch.phone = row.user.phone;
    if (!existing.dob && row.user.dob) patch.dob = parseMaybeDate(row.user.dob) || undefined;
    if (!existing.gender && row.user.gender) patch.gender = row.user.gender;
    if (!existing.preferredMode && row.user.preferredMode) patch.preferredMode = row.user.preferredMode;
    if (existing.role !== USER_ROLES.TUTOR) patch.role = USER_ROLES.TUTOR;

    // Keep them active by default
    if (typeof existing.isActive !== 'boolean') patch.isActive = true;

    if (Object.keys(patch).length) {
      await User.updateOne({ _id: existing._id }, { $set: patch });
    }
    return existing;
  }

  const created = await User.create({
    name: row.user.name || 'Tutor',
    email,
    password: defaultPassword,
    role: USER_ROLES.TUTOR,
    phone: row.user.phone,
    dob: parseMaybeDate(row.user.dob || undefined),
    gender: row.user.gender,
    preferredMode: row.user.preferredMode,
    isActive: row.user.isActive ?? true,
    acceptedTerms: row.user.acceptedTerms ?? true,
    acceptedPolicies: row.user.acceptedPolicies ?? true,
  } as any);

  return created;
}

async function upsertTutorProfile(userId: mongoose.Types.ObjectId, row: NormalizedTutorRow) {
  const tutorPayload: any = {
    user: userId,
    experienceHours: 0,
    yearsOfExperience: Number(row.tutor.yearsOfExperience || 0),
    subjects: Array.isArray(row.tutor.subjects) ? row.tutor.subjects.filter(Boolean) : [],
    qualifications: Array.isArray(row.tutor.qualifications) ? row.tutor.qualifications.filter(Boolean) : [],
    extracurricularActivities: Array.isArray(row.tutor.extracurricularActivities) ? row.tutor.extracurricularActivities.filter(Boolean) : [],
    preferredMode: row.tutor.preferredMode,
    preferredLocations: Array.isArray(row.tutor.preferredLocations) ? row.tutor.preferredLocations.filter(Boolean) : [],
    preferredCities: Array.isArray(row.tutor.preferredCities) ? row.tutor.preferredCities.filter(Boolean) : [],
    permanentAddress: row.tutor.permanentAddress,
    residentialAddress: row.tutor.residentialAddress,
    alternatePhone: row.tutor.alternatePhone,
    documents: normalizeDocuments(row.tutor.documents),
    verificationFeePaymentProof: row.tutor.verificationFeePaymentProof,
    verificationStatus: VERIFICATION_STATUS.PENDING,
    isAvailable: true,
    tier: TUTOR_TIER.BRONZE,
  };

  if (!tutorPayload.subjects.length) {
    tutorPayload.subjects = ['General'];
  }

  const existing = await Tutor.findOne({ user: userId });
  if (existing) {
    await Tutor.updateOne(
      { _id: existing._id },
      {
        $set: {
          subjects: tutorPayload.subjects,
          qualifications: tutorPayload.qualifications,
          extracurricularActivities: tutorPayload.extracurricularActivities,
          preferredMode: tutorPayload.preferredMode,
          preferredLocations: tutorPayload.preferredLocations,
          preferredCities: tutorPayload.preferredCities,
          permanentAddress: tutorPayload.permanentAddress,
          residentialAddress: tutorPayload.residentialAddress,
          alternatePhone: tutorPayload.alternatePhone,
          documents: tutorPayload.documents,
          verificationFeePaymentProof: tutorPayload.verificationFeePaymentProof,
          yearsOfExperience: tutorPayload.yearsOfExperience,
          isAvailable: true,
        },
        $setOnInsert: {
          tier: TUTOR_TIER.BRONZE,
        },
      }
    );
    return existing;
  }

  const created = await Tutor.create(tutorPayload);
  return created;
}

async function main() {
  const filePath = "C:\\Users\\Rhydham\\Desktop\\projects\\ys-final\\v3\\web-app\\pyscripts\\tur.json";

  if (!fs.existsSync(filePath)) {
    console.error('[seedTutorsFromNormalizedJson] Input file not found:', filePath);
    process.exit(1);
  }

  const defaultPassword = process.env.SEED_DEFAULT_PASSWORD || 'Password@123';

  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = JSON.parse(raw) as NormalizedTutorRow[];

  await connect();

  let userUpserts = 0;
  let tutorUpserts = 0;
  let skipped = 0;

  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const email = String(row?.user?.email || '').trim();
      if (!email) {
        skipped++;
        continue;
      }

      try {
        const user = await upsertTutorUser(row, defaultPassword);
        if (!user) {
          skipped++;
          continue;
        }
        userUpserts++;

        await upsertTutorProfile(user._id, row);
        tutorUpserts++;

        if ((i + 1) % 25 === 0) {
          console.log(`[seedTutorsFromNormalizedJson] Processed ${i + 1}/${rows.length}`);
        }
      } catch (e) {
        console.error(`[seedTutorsFromNormalizedJson] Failed at row ${i} (${email})`, e);
      }
    }

    console.log('[seedTutorsFromNormalizedJson] Done', { userUpserts, tutorUpserts, skipped, total: rows.length });
    console.log(`[seedTutorsFromNormalizedJson] Default password for newly created users: ${defaultPassword}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error('[seedTutorsFromNormalizedJson] Fatal error', e);
  process.exit(1);
});
