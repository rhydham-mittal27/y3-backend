import mongoose, { Schema, Document, Model } from 'mongoose';
import { TEACHING_MODE, VERIFICATION_STATUS, TUTOR_TIER } from '../config/constants';

export interface IDocumentEmbedded {
  documentType: 'AADHAAR' | 'CERTIFICATE' | 'EXPERIENCE_PROOF' | 'DEGREE' | 'OTHER';
  documentUrl: string;
  uploadedAt: Date;
  publicId?: string;
  resourceType?: string;
  verifiedAt?: Date;
}

export interface ITutorDocument extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  experienceHours: number;
  subjects: string[];
  qualifications?: string[];
  ratings: number;
  totalRatings: number;
  classesAssigned: number;
  classesCompleted: number;
  demosTaken: number;
  demosApproved: number;
  interestCount: number;
  verificationStatus: VERIFICATION_STATUS | string;
  documents: IDocumentEmbedded[];
  verificationNotes?: string;
  verifiedBy?: mongoose.Types.ObjectId | null;
  verifiedAt?: Date;
  isAvailable: boolean;
  preferredMode?: TEACHING_MODE | string;
  preferredLocations?: string[];
  preferredCities?: string[];
  createdAt: Date;
  updatedAt: Date;
  approvalRatio?: number;
  tier: TUTOR_TIER | string;
  tierUpdatedAt?: Date;
  tierUpdatedBy?: mongoose.Types.ObjectId;
  pendingTierChange?: {
    newTier: TUTOR_TIER | string;
    requestedAt: Date;
    requestedBy: mongoose.Types.ObjectId;
    reason?: string;
  };
  monthlyStats?: {
    month: string; // e.g. '2025-11'
    totalClasses: number;
    totalSessions: number;
    completedSessions: number;
  };
  settings?: {
    availabilityPreferences?: {
      daysAvailable?: string[];
      timeSlots?: string[];
      maxClassesPerWeek?: number;
    };
    teachingModePreference?: TEACHING_MODE | string;
    preferredSubjects?: string[];
    preferredLocations?: string[];
    notificationSettings?: {
      classAssignments?: boolean;
      demoRequests?: boolean;
      feedbackReceived?: boolean;
    };
  };
}

const DocumentSchema = new Schema<IDocumentEmbedded>(
  {
    documentType: {
      type: String,
      enum: ['AADHAAR', 'CERTIFICATE', 'EXPERIENCE_PROOF', 'DEGREE', 'OTHER'],
      required: true,
    },
    documentUrl: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    publicId: { type: String },
    resourceType: { type: String },
    verifiedAt: { type: Date },
  },
  { _id: false }
);

const TutorSchema: Schema<ITutorDocument> = new Schema<ITutorDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    experienceHours: { type: Number, required: true, default: 0 },
    subjects: { type: [String], required: true },
    qualifications: { type: [String] },
    ratings: { type: Number, default: 0, min: 0, max: 5 },
    totalRatings: { type: Number, default: 0 },
    classesAssigned: { type: Number, default: 0 },
    classesCompleted: { type: Number, default: 0 },
    demosTaken: { type: Number, default: 0 },
    demosApproved: { type: Number, default: 0 },
    interestCount: { type: Number, default: 0 },
    verificationStatus: { type: String, enum: Object.values(VERIFICATION_STATUS), default: VERIFICATION_STATUS.PENDING },
    documents: { type: [DocumentSchema], default: [] },
    verificationNotes: { type: String },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    isAvailable: { type: Boolean, default: true },
    preferredMode: { type: String, enum: Object.values(TEACHING_MODE) },
    preferredLocations: { type: [String] },
    preferredCities: { type: [String] },
    settings: {
      type: {
        availabilityPreferences: {
          type: {
            daysAvailable: { type: [String], default: [] },
            timeSlots: { type: [String], default: [] },
            maxClassesPerWeek: { type: Number, default: 0 },
          },
          default: {},
        },
        teachingModePreference: { type: String, enum: Object.values(TEACHING_MODE) },
        preferredSubjects: { type: [String], default: [] },
        preferredLocations: { type: [String], default: [] },
        notificationSettings: {
          type: {
            classAssignments: { type: Boolean, default: true },
            demoRequests: { type: Boolean, default: true },
            feedbackReceived: { type: Boolean, default: true },
          },
          default: {},
        },
      },
      default: {},
    },
    tier: { type: String, enum: Object.values(TUTOR_TIER), default: TUTOR_TIER.BRONZE, required: true },
    tierUpdatedAt: { type: Date },
    tierUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    pendingTierChange: {
      type: {
        newTier: String,
        requestedAt: Date,
        requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        reason: String,
      },
    },
    monthlyStats: {
      month: { type: String },
      totalClasses: { type: Number, default: 0 },
      totalSessions: { type: Number, default: 0 },
      completedSessions: { type: Number, default: 0 },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Virtuals
TutorSchema.virtual('approvalRatio').get(function (this: ITutorDocument) {
  if (!this.demosTaken) return 0;
  return (this.demosApproved / this.demosTaken) * 100;
});

// Indexes
TutorSchema.index({ user: 1 }, { unique: true });
TutorSchema.index({ verificationStatus: 1 });
TutorSchema.index({ isAvailable: 1, subjects: 1 });
TutorSchema.index({ ratings: -1 });
TutorSchema.index({ tier: 1 });

const Tutor: Model<ITutorDocument> =
  mongoose.models.Tutor || mongoose.model<ITutorDocument>('Tutor', TutorSchema);

export default Tutor;
