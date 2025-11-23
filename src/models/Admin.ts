import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAdminDocument extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  usersCreated: number;
  managersCreated: number;
  coordinatorsCreated: number;
  tutorsCreated: number;
  parentsCreated: number;
  dataModifications: number;
  dataDeletes: number;
  systemActionsPerformed: number;
  joiningDate: Date;
  department?: string;
  isActive: boolean;
  lastActivityAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  totalUsersManaged?: number;
  averageActionsPerDay?: number;
  settings?: {
    systemPreferences?: {
      maintenanceMode?: boolean;
      allowBulkOperations?: boolean;
      requireApprovalForDeletes?: boolean;
      sessionTimeout?: number;
    };
    dataExportSettings?: {
      autoBackupEnabled?: boolean;
      backupFrequency?: 'daily' | 'weekly' | 'monthly';
      exportFormats?: string[];
      includeDeletedRecords?: boolean;
    };
    auditLogPreferences?: {
      logLevel?: 'minimal' | 'standard' | 'detailed';
      retentionDays?: number;
      alertOnCriticalActions?: boolean;
      emailDigestFrequency?: 'daily' | 'weekly' | 'never';
    };
    notificationSettings?: {
      systemAlerts?: boolean;
      userCreations?: boolean;
      bulkOperations?: boolean;
      securityEvents?: boolean;
    };
  };
}

const AdminSchema: Schema<IAdminDocument> = new Schema<IAdminDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    usersCreated: { type: Number, default: 0 },
    managersCreated: { type: Number, default: 0 },
    coordinatorsCreated: { type: Number, default: 0 },
    tutorsCreated: { type: Number, default: 0 },
    parentsCreated: { type: Number, default: 0 },
    dataModifications: { type: Number, default: 0 },
    dataDeletes: { type: Number, default: 0 },
    systemActionsPerformed: { type: Number, default: 0 },
    joiningDate: { type: Date, default: Date.now },
    department: { type: String },
    isActive: { type: Boolean, default: true },
    lastActivityAt: { type: Date },
    settings: {
      type: {
        systemPreferences: {
          type: {
            maintenanceMode: { type: Boolean, default: false },
            allowBulkOperations: { type: Boolean, default: true },
            requireApprovalForDeletes: { type: Boolean, default: true },
            sessionTimeout: { type: Number, default: 30 },
          },
          default: {},
        },
        dataExportSettings: {
          type: {
            autoBackupEnabled: { type: Boolean, default: true },
            backupFrequency: { type: String, default: 'daily' },
            exportFormats: { type: [String], default: ['csv', 'json'] },
            includeDeletedRecords: { type: Boolean, default: false },
          },
          default: {},
        },
        auditLogPreferences: {
          type: {
            logLevel: { type: String, default: 'standard' },
            retentionDays: { type: Number, default: 90 },
            alertOnCriticalActions: { type: Boolean, default: true },
            emailDigestFrequency: { type: String, default: 'weekly' },
          },
          default: {},
        },
        notificationSettings: {
          type: {
            systemAlerts: { type: Boolean, default: true },
            userCreations: { type: Boolean, default: true },
            bulkOperations: { type: Boolean, default: true },
            securityEvents: { type: Boolean, default: true },
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
AdminSchema.virtual('totalUsersManaged').get(function (this: IAdminDocument) {
  const sum =
    (this.usersCreated || 0) +
    (this.managersCreated || 0) +
    (this.coordinatorsCreated || 0) +
    (this.tutorsCreated || 0) +
    (this.parentsCreated || 0);
  return sum || 0;
});

AdminSchema.virtual('averageActionsPerDay').get(function (this: IAdminDocument) {
  const actions = this.systemActionsPerformed || 0;
  if (!this.joiningDate || !(this.joiningDate instanceof Date) || isNaN(this.joiningDate.getTime())) {
    return 0;
  }
  const now = new Date();
  const diffMs = now.getTime() - this.joiningDate.getTime();
  const days = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (actions <= 0) return 0;
  return actions / days;
});

// Indexes
AdminSchema.index({ user: 1 }, { unique: true });
AdminSchema.index({ isActive: 1 });
AdminSchema.index({ isActive: 1, systemActionsPerformed: 1 });

const Admin: Model<IAdminDocument> =
  mongoose.models.Admin || mongoose.model<IAdminDocument>('Admin', AdminSchema);

export default Admin;
