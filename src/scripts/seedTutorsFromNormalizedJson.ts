import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import User, { IUserDocument } from '../models/User';
import Tutor, { ITutorDocument } from '../models/Tutor';
import Option from '../models/Option';
import { USER_ROLES, TUTOR_TIER, VERIFICATION_STATUS } from '../config/constants';
import { generateTeacherIdWithCityCode } from '../utils/generateTeacherId';

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
    createdAt?: string;
  };
  tutor: {
    teacherId?: string;
    alternatePhone?: string;
    permanentAddress?: string;
    residentialAddress?: string;
    subjects: string[];
    qualifications?: string[];
    extracurricularActivities?: string[];
    preferredMode?: string;
    preferredLocations?: string[];
    preferredCities?: string[];
    bio?: string;
    verificationStatus?: string;
    verificationNotes?: string;
    whatsappCommunityJoined?: boolean;
    tier?: string;
    createdAt?: string;
    metadata?: Record<string, any>;
  };
};

function parseMaybeDate(val?: string | null) {
  if (!val) return undefined;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

async function connect() {
  if (!uri) throw new Error('Missing MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  console.log('[seedTutorsFromNormalizedJson] Connected to MongoDB');
}

const cityCodeCache = new Map<string, string>();

async function getCityCode(cityName: string): Promise<string> {
  const normalized = cityName.toUpperCase();
  if (cityCodeCache.has(normalized)) return cityCodeCache.get(normalized)!;

  const cityOption = await Option.findOne({
    type: 'CITY',
    $or: [{ label: new RegExp(`^${cityName}$`, 'i') }, { value: normalized }],
  });

  let code = '';
  if (cityOption?.metadata?.cityCode) {
    code = cityOption.metadata.cityCode.toUpperCase();
  } else {
    code = cityName.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
  }
  
  cityCodeCache.set(normalized, code);
  return code;
}

async function upsertTutorUser(row: NormalizedTutorRow, defaultPassword: string): Promise<IUserDocument | null> {
  const email = String(row?.user?.email || '').toLowerCase().trim();
  if (!email) return null;

  const userData: any = {
    name: row.user.name || 'Tutor',
    email,
    phone: row.user.phone,
    role: USER_ROLES.TUTOR,
    dob: parseMaybeDate(row.user.dob),
    gender: row.user.gender,
    preferredMode: row.user.preferredMode,
    isActive: row.user.isActive ?? true,
    acceptedTerms: row.user.acceptedTerms ?? true,
    acceptedPolicies: row.user.acceptedPolicies ?? true,
    createdAt: parseMaybeDate(row.user.createdAt) || new Date(),
  };

  let user = await User.findOne({ email });
  if (user) {
    Object.assign(user, userData);
    await user.save();
    return user;
  }

  user = await User.create({
    ...userData,
    password: defaultPassword,
  });

  return user;
}

async function upsertTutorProfile(user: IUserDocument, row: NormalizedTutorRow) {
  const userId = user._id;
  
  let cityName = 'Bhopal';
  if (row.tutor.preferredCities?.length) {
    cityName = row.tutor.preferredCities[0];
  } else if (row.tutor.preferredLocations?.length) {
    cityName = row.tutor.preferredLocations[0];
  }

  const cityCode = await getCityCode(cityName);

  let existing = await Tutor.findOne({ user: userId }) as ITutorDocument | null;
  
  let teacherId = row.tutor.teacherId || (existing ? existing.teacherId : null);
  
  if (!teacherId || teacherId === 'null' || teacherId === '') {
    // Attempt to guess gender if missing for ID prefix
    let gender = (user as any).gender;
    if (!gender) {
        const n = (user.name || '').toLowerCase();
        if (n.includes('ms.') || n.includes('mrs.') || n.includes('km.') || n.includes('miss')) gender = 'FEMALE';
        else if (n.includes('mr.')) gender = 'MALE';
    }

    teacherId = generateTeacherIdWithCityCode(gender, cityCode, cityName);
    
    // Check for collisions
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      const collision = await Tutor.findOne({ teacherId });
      if (!collision) {
        isUnique = true;
      } else {
        teacherId = generateTeacherIdWithCityCode(gender, cityCode, cityName);
        attempts++;
      }
    }
  }

  const tutorPayload: any = {
    user: userId,
    teacherId,
    experienceHours: 0,
    yearsOfExperience: Number((row.tutor as any).yearsOfExperience || 0),
    subjects: Array.isArray(row.tutor.subjects) ? row.tutor.subjects.filter(Boolean) : [],
    preferredMode: row.tutor.preferredMode,
    preferredLocations: Array.isArray(row.tutor.preferredLocations) ? row.tutor.preferredLocations.filter(Boolean) : [],
    preferredCities: Array.isArray(row.tutor.preferredCities) ? row.tutor.preferredCities.filter(Boolean) : [],
    bio: row.tutor.bio,
    verificationStatus: row.tutor.verificationStatus || VERIFICATION_STATUS.PENDING,
    verificationNotes: row.tutor.verificationNotes,
    whatsappCommunityJoined: row.tutor.whatsappCommunityJoined ?? false,
    isAvailable: true,
    tier: row.tutor.tier || TUTOR_TIER.BRONZE,
    createdAt: parseMaybeDate(row.tutor.createdAt) || parseMaybeDate(row.user.createdAt) || new Date(),
    documents: (row.tutor as any).documents || [],
    verificationFeePaymentProof: (row.tutor as any).verificationFeePaymentProof,
  };

  if (existing) {
    Object.assign(existing, tutorPayload);
    await existing.save();
    return existing;
  }

  const created = await Tutor.create(tutorPayload);
  return created;
}

async function main() {
  const filePath = path.join(process.cwd(), '..', 'pyscripts', 'tutors.normalized.json');

  if (!fs.existsSync(filePath)) {
    console.error('[seedTutorsFromNormalizedJson] Input file not found:', filePath);
    process.exit(1);
  }

  const defaultPassword = process.env.SEED_DEFAULT_PASSWORD || 'Password@123';

  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = JSON.parse(raw) as NormalizedTutorRow[];

  await connect();

  // Additive seeding: No clearing of existing data
  console.log('[seedTutorsFromNormalizedJson] Starting additive seeding...');

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

        const tutor = await upsertTutorProfile(user, row);
        tutorUpserts++;

        if ((i + 1) % 50 === 0) {
          console.log(`[seedTutorsFromNormalizedJson] Processed ${i + 1}/${rows.length}. Last ID: ${(tutor as any).teacherId}`);
        }
      } catch (e) {
        console.error(`[seedTutorsFromNormalizedJson] Failed at row ${i} (${email})`, e);
      }
    }

    console.log('[seedTutorsFromNormalizedJson] Done', { userUpserts, tutorUpserts, skipped, total: rows.length });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error('[seedTutorsFromNormalizedJson] Fatal error', e);
  process.exit(1);
});
