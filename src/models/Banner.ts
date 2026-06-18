import mongoose, { Schema, Document } from 'mongoose';

export interface IBanner extends Document {
  imageUrl: string;
  s3Key: string;
  uploaderName: string;
  uploaderRole: 'ADMIN' | 'COORDINATOR';
  uploadedBy: mongoose.Types.ObjectId;
  coordinatorUserId?: mongoose.Types.ObjectId;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BannerSchema = new Schema<IBanner>(
  {
    imageUrl:        { type: String, required: true },
    s3Key:           { type: String, required: true },
    uploaderName:    { type: String, required: true },
    uploaderRole:    { type: String, enum: ['ADMIN', 'COORDINATOR'], required: true },
    uploadedBy:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    coordinatorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    expiresAt:       { type: Date, required: true },
    isActive:        { type: Boolean, default: true },
  },
  { timestamps: true }
);

BannerSchema.index({ expiresAt: 1, isActive: 1 });
BannerSchema.index({ coordinatorUserId: 1 });

export default mongoose.model<IBanner>('Banner', BannerSchema);
