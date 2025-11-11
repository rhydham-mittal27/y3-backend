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
  department?: string;
  isActive: boolean;
  lastActivityAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  conversionRate?: number;
  averageRevenuePerClass?: number;
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
    department: { type: String },
    isActive: { type: Boolean, default: true },
    lastActivityAt: { type: Date },
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

// Indexes
ManagerSchema.index({ user: 1 }, { unique: true });
ManagerSchema.index({ isActive: 1 });
ManagerSchema.index({ isActive: 1, classLeadsCreated: 1 });

const Manager: Model<IManagerDocument> =
  mongoose.models.Manager || mongoose.model<IManagerDocument>('Manager', ManagerSchema);

export default Manager;
