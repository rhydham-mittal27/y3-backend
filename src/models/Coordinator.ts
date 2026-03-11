import mongoose, { Schema, Document, Model } from 'mongoose';
import { VERIFICATION_STATUS } from '../config/constants';
import { getS3PublicUrlForKey } from '../config/s3';

export interface ICoordinatorDocument extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  assignedClasses: mongoose.Types.ObjectId[];
  maxClassCapacity: number;
  activeClassesCount: number;
  totalClassesHandled: number;
  specialization?: string[];
  joiningDate: Date;
  performanceScore: number;
  verificationStatus: VERIFICATION_STATUS | string;
  verificationNotes?: string;
  verifiedBy?: mongoose.Types.ObjectId;
  verifiedAt?: Date;
  documents?: {
    documentType: 'AADHAAR' | 'PROFILE_PHOTO' | 'EXPERIENCE_PROOF' | 'DEGREE' | 'CERTIFICATE' | 'OTHER';
    documentUrl: string;
    uploadedAt: Date;
    verifiedAt?: Date;
    s3Key?: string;
    s3Bucket?: string;
  }[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  availableCapacity?: number;
  settings?: {
    classCapacitySettings?: {
      preferredMaxCapacity?: number;
      autoAcceptClasses?: boolean;
      capacityAlertThreshold?: number;
    };
    specializationAreas?: string[];
    notificationSettings?: {
      attendanceApprovals?: boolean;
      paymentReminders?: boolean;
      testScheduling?: boolean;
      parentComplaints?: boolean;
    };
    workingHours?: {
      startTime?: string;
      endTime?: string;
      workingDays?: string[];
    };
  };
}

const CoordinatorSchema: Schema<ICoordinatorDocument> = new Schema<ICoordinatorDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    assignedClasses: { type: [Schema.Types.ObjectId], ref: 'FinalClass', default: [] },
    maxClassCapacity: { type: Number, default: 10 },
    activeClassesCount: { type: Number, default: 0 },
    totalClassesHandled: { type: Number, default: 0 },
    specialization: { type: [String] },
    joiningDate: { type: Date, default: Date.now },
    performanceScore: { type: Number, default: 0, min: 0, max: 100 },
    verificationStatus: {
      type: String,
      enum: Object.values(VERIFICATION_STATUS),
      default: VERIFICATION_STATUS.PENDING,
    },
    verificationNotes: { type: String, trim: true },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    documents: [
      {
        documentType: {
          type: String,
          enum: ['AADHAAR', 'PROFILE_PHOTO', 'EXPERIENCE_PROOF', 'DEGREE', 'CERTIFICATE', 'OTHER'],
          required: true,
        },
        documentUrl: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
        verifiedAt: { type: Date },
        s3Key: { type: String },
        s3Bucket: { type: String },
      },
    ],
    isActive: { type: Boolean, default: true },
    settings: {
      type: {
        classCapacitySettings: {
          type: {
            preferredMaxCapacity: { type: Number, default: 10 },
            autoAcceptClasses: { type: Boolean, default: false },
            capacityAlertThreshold: { type: Number, default: 80 },
          },
          default: {},
        },
        specializationAreas: { type: [String], default: [] },
        notificationSettings: {
          type: {
            attendanceApprovals: { type: Boolean, default: true },
            paymentReminders: { type: Boolean, default: true },
            testScheduling: { type: Boolean, default: true },
            parentComplaints: { type: Boolean, default: true },
          },
          default: {},
        },
        workingHours: {
          type: {
            startTime: { type: String, default: '09:00' },
            endTime: { type: String, default: '18:00' },
            workingDays: { type: [String], default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] },
          },
          default: {},
        },
        attendanceControls: {
          type: {
            sameDayOnly: { type: Boolean, default: true },
            allowTutorReschedule: { type: Boolean, default: true },
          },
          default: {},
        },
      },
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        if (Array.isArray(ret?.documents)) {
          ret.documents = ret.documents.map((d: any) => {
            if (!d) return d;
            const out = { ...d };
            const val = out.documentUrl;
            if (typeof val === 'string' && val.length > 0 && !/^https?:\/\//i.test(val)) {
              out.documentUrl = getS3PublicUrlForKey(val);
            }
            return out;
          });
        }
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        if (Array.isArray(ret?.documents)) {
          ret.documents = ret.documents.map((d: any) => {
            if (!d) return d;
            const out = { ...d };
            const val = out.documentUrl;
            if (typeof val === 'string' && val.length > 0 && !/^https?:\/\//i.test(val)) {
              out.documentUrl = getS3PublicUrlForKey(val);
            }
            return out;
          });
        }
        return ret;
      },
    },
  }
);

// Virtuals
CoordinatorSchema.virtual('availableCapacity').get(function (this: ICoordinatorDocument) {
  return (this.maxClassCapacity || 0) - (this.activeClassesCount || 0);
});

// Indexes
CoordinatorSchema.index({ isActive: 1 });
CoordinatorSchema.index({ isActive: 1, activeClassesCount: 1 });

const Coordinator: Model<ICoordinatorDocument> =
  mongoose.models.Coordinator || mongoose.model<ICoordinatorDocument>('Coordinator', CoordinatorSchema);

export default Coordinator;
