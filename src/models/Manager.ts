import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IManagerDocument extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  classLeadsCreated: number;
  demosScheduled: number;
  classesConverted: number;
  revenueGenerated: number;
  tutorsVerified: number;
  coordinatorsCreated: number;
  paymentsProcessed: number;
  joiningDate: Date;
  bio?: string;
  languagesKnown: string[];
  skills: string[];
  permanentAddress?: string;
  residentialAddress?: string;
  documents: {
    documentType: 'AADHAAR' | 'PAN' | 'VOTER_ID' | 'PROFILE_PHOTO' | 'OTHER';
    documentUrl: string;
    uploadedAt: Date;
    verifiedAt?: Date;
    s3Key?: string;
    s3Bucket?: string;
  }[];
  verificationStatus: string;
  department?: string;
  isActive: boolean;
  lastActivityAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  conversionRate?: number;
  averageRevenuePerClass?: number;
  permissions?: {
    canViewSiteLeads?: boolean;
    canVerifyTutors?: boolean;
    canCreateLeads?: boolean;
    canManagePayments?: boolean;
  };
  settings?: {
    dashboardPreferences?: {
      defaultView?: 'overview' | 'leads' | 'classes' | 'revenue';
      defaultDateRange?: 'week' | 'month' | 'quarter' | 'year';
      chartPreferences?: string[];
    };
    defaultFilters?: {
      leadStatus?: string[];
      classStatus?: string[];
      tutorVerificationStatus?: string;
    };
    notificationSettings?: {
      newLeads?: boolean;
      leadConversions?: boolean;
      demoScheduled?: boolean;
      paymentReceived?: boolean;
      tutorVerifications?: boolean;
    };
    reportPreferences?: {
      autoExportFrequency?: 'daily' | 'weekly' | 'monthly' | 'never';
      exportFormat?: 'csv' | 'pdf' | 'both';
    };
  };
}

const ManagerSchema: Schema<IManagerDocument> = new Schema<IManagerDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    classLeadsCreated: { type: Number, default: 0 },
    demosScheduled: { type: Number, default: 0 },
    classesConverted: { type: Number, default: 0 },
    revenueGenerated: { type: Number, default: 0 },
    tutorsVerified: { type: Number, default: 0 },
    coordinatorsCreated: { type: Number, default: 0 },
    paymentsProcessed: { type: Number, default: 0 },
    joiningDate: { type: Date, default: Date.now },
    bio: { type: String, trim: true },
    languagesKnown: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    permanentAddress: { type: String },
    residentialAddress: { type: String },
    documents: [{
      documentType: { 
        type: String, 
        enum: ['AADHAAR', 'PAN', 'VOTER_ID', 'PROFILE_PHOTO', 'OTHER'],
        required: true 
      },
      documentUrl: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now },
      verifiedAt: { type: Date },
      s3Key: { type: String },
      s3Bucket: { type: String }
    }],
    verificationStatus: { 
      type: String, 
      enum: ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED'], 
      default: 'PENDING' 
    },
    department: { type: String },
    isActive: { type: Boolean, default: true },
    lastActivityAt: { type: Date },
    permissions: {
      type: {
        canViewSiteLeads: { type: Boolean, default: true },
        canVerifyTutors: { type: Boolean, default: true },
        canCreateLeads: { type: Boolean, default: true },
        canManagePayments: { type: Boolean, default: true },
      },
      default: {},
    },
    settings: {
      type: {
        dashboardPreferences: {
          type: {
            defaultView: { type: String, default: 'overview' },
            defaultDateRange: { type: String, default: 'month' },
            chartPreferences: { type: [String], default: ['conversionFunnel', 'revenueChart'] },
          },
          default: {},
        },
        defaultFilters: {
          type: {
            leadStatus: { type: [String], default: [] },
            classStatus: { type: [String], default: [] },
            tutorVerificationStatus: { type: String, default: 'PENDING' },
          },
          default: {},
        },
        notificationSettings: {
          type: {
            newLeads: { type: Boolean, default: true },
            leadConversions: { type: Boolean, default: true },
            demoScheduled: { type: Boolean, default: true },
            paymentReceived: { type: Boolean, default: true },
            tutorVerifications: { type: Boolean, default: true },
          },
          default: {},
        },
        reportPreferences: {
          type: {
            autoExportFrequency: { type: String, default: 'weekly' },
            exportFormat: { type: String, default: 'csv' },
          },
          default: {},
        },
      },
      default: {},
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Virtuals
ManagerSchema.virtual('conversionRate').get(function (this: IManagerDocument) {
  if (!this.classLeadsCreated) return 0;
  return (this.classesConverted / this.classLeadsCreated) * 100;
});

ManagerSchema.virtual('averageRevenuePerClass').get(function (this: IManagerDocument) {
  if (!this.classesConverted) return 0;
  return this.revenueGenerated / this.classesConverted;
});

ManagerSchema.virtual('isProfileComplete').get(function (this: IManagerDocument) {
  const hasBio = !!this.bio && this.bio.length > 20;
  const hasAddress = !!this.residentialAddress;
  const hasAadhaar = this.documents?.some(d => d.documentType === 'AADHAAR');
  return !!(hasBio && hasAddress && hasAadhaar);
});

// Indexes
ManagerSchema.index({ isActive: 1 });
ManagerSchema.index({ isActive: 1, classLeadsCreated: 1 });

const Manager: Model<IManagerDocument> =
  mongoose.models.Manager || mongoose.model<IManagerDocument>('Manager', ManagerSchema);

export default Manager;
