import mongoose, { Schema, Document, Model } from 'mongoose';

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
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  availableCapacity?: number;
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
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Virtuals
CoordinatorSchema.virtual('availableCapacity').get(function (this: ICoordinatorDocument) {
  return (this.maxClassCapacity || 0) - (this.activeClassesCount || 0);
});

// Indexes
CoordinatorSchema.index({ user: 1 }, { unique: true });
CoordinatorSchema.index({ isActive: 1 });
CoordinatorSchema.index({ isActive: 1, activeClassesCount: 1 });

const Coordinator: Model<ICoordinatorDocument> =
  mongoose.models.Coordinator || mongoose.model<ICoordinatorDocument>('Coordinator', CoordinatorSchema);

export default Coordinator;
