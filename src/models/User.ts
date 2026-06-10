import mongoose, { Schema, Model } from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { USER_ROLES, TEACHING_MODE } from '../config/constants';
import { softDeletePlugin, SoftDeleteDocument } from '../utils/softDelete.plugin';

export interface IUserDocument extends SoftDeleteDocument {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password: string;
  phone?: string;
  dob?: Date;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  city?: string;
  preferredMode?: string;
  role: USER_ROLES | string;
  isActive: boolean;
  acceptedTerms: boolean;
  acceptedPolicies?: boolean;
  acceptedAt?: Date;
  policyVersion?: string;
  accepted_policies?: boolean;
  accepted_at?: Date;
  policy_version?: string;
  refreshToken?: string | null;
  preferences?: mongoose.Types.ObjectId;
  devices?: {
    deviceId: string;
    fcmToken: string;
    deviceType: 'ios' | 'android';
    deviceName?: string;
    lastActiveAt: Date;
    registeredAt: Date;
  }[];
  expoPushToken?: string;
  lastLoginAt?: Date;
  lastLoginDevice?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(enteredPassword: string): Promise<boolean>;
  generateAccessToken(): string;
  generateRefreshToken(): string;
  addDevice(
    deviceId: string,
    fcmToken: string,
    deviceType: 'ios' | 'android',
    deviceName?: string
  ): Promise<void>;
  removeDevice(deviceId: string): Promise<void>;
  updateDeviceToken(deviceId: string, newFcmToken: string): Promise<void>;
  removeAllDevices(): Promise<void>;
}

const UserSchema: Schema<IUserDocument> = new Schema<IUserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please add a valid email'],
    },
    password: { type: String, required: true, select: false },
    phone: { type: String },
    dob: { type: Date },
    gender: {
      type: String,
      enum: ['MALE', 'FEMALE', 'OTHER'],
    },
    city: { type: String, trim: true },
    preferredMode: { type: String, enum: Object.values(TEACHING_MODE) },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.MANAGER,
    },
    isActive: { type: Boolean, default: true },
    acceptedTerms: { type: Boolean, default: false },
    acceptedPolicies: { type: Boolean, default: false },
    acceptedAt: { type: Date },
    policyVersion: { type: String, trim: true },
    accepted_policies: { type: Boolean, default: false },
    accepted_at: { type: Date },
    policy_version: { type: String, trim: true },
    refreshToken: { type: String, select: false },
    preferences: { type: Schema.Types.ObjectId, ref: 'UserPreferences' },
    devices: [
      {
        deviceId: { type: String, required: true },
        fcmToken: { type: String, required: true },
        deviceType: { type: String, enum: ['ios', 'android'], required: true },
        deviceName: { type: String },
        lastActiveAt: { type: Date, default: Date.now },
        registeredAt: { type: Date, default: Date.now },
      },
    ],
    expoPushToken: { type: String, default: null },
    lastLoginAt: { type: Date },
    lastLoginDevice: { type: String },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

UserSchema.index({ 'devices.fcmToken': 1 });
UserSchema.index({ 'devices.deviceId': 1 });

UserSchema.pre<IUserDocument>('save', async function (next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = async function (enteredPassword: string) {
  return bcrypt.compare(enteredPassword, this.password);
};

UserSchema.methods.generateAccessToken = function (): string {
  const payload = {
    userId: this._id.toString(),
    email: this.email,
    role: this.role,
  };
  const secretEnv = process.env.JWT_SECRET;
  if (!secretEnv) throw new Error('JWT_SECRET is not configured');
  const secret: jwt.Secret = secretEnv as unknown as jwt.Secret;
  const expiresInEnv = process.env.JWT_EXPIRE;
  const expiresIn = (expiresInEnv && String(expiresInEnv).trim().length > 0)
    ? String(expiresInEnv).trim()
    : '7d';
  const options: jwt.SignOptions = { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload, secret, options);
};

UserSchema.methods.generateRefreshToken = function (): string {
  const payload = { userId: this._id.toString() };
  const secretEnv = process.env.JWT_REFRESH_SECRET;
  if (!secretEnv) throw new Error('JWT_REFRESH_SECRET is not configured');
  const secret: jwt.Secret = secretEnv as unknown as jwt.Secret;
  const expiresInEnv = process.env.JWT_REFRESH_EXPIRE;
  const expiresIn = (expiresInEnv && String(expiresInEnv).trim().length > 0)
    ? String(expiresInEnv).trim()
    : '30d';
  const options: jwt.SignOptions = { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload, secret, options);
};

UserSchema.methods.addDevice = async function (
  deviceId: string,
  fcmToken: string,
  deviceType: 'ios' | 'android',
  deviceName?: string
) {
  const devices = this.devices || [];
  const existingIndex = devices.findIndex((d: any) => d.deviceId === deviceId);

  const now = new Date();
  const devicePayload = {
    deviceId,
    fcmToken,
    deviceType,
    deviceName,
    lastActiveAt: now,
    registeredAt: now,
  };

  if (existingIndex >= 0) {
    devices[existingIndex] = {
      ...devices[existingIndex],
      ...devicePayload,
      registeredAt: devices[existingIndex].registeredAt || now,
    };
  } else {
    devices.push(devicePayload as any);
  }

  this.devices = devices;
  await this.save();
};

UserSchema.methods.removeDevice = async function (deviceId: string) {
  const devices = this.devices || [];
  this.devices = devices.filter((d: any) => d.deviceId !== deviceId);
  await this.save();
};

UserSchema.methods.updateDeviceToken = async function (deviceId: string, newFcmToken: string) {
  const devices = this.devices || [];
  const device = devices.find((d: any) => d.deviceId === deviceId);
  if (device) {
    device.fcmToken = newFcmToken;
    device.lastActiveAt = new Date();
  }
  this.devices = devices;
  await this.save();
};

UserSchema.methods.removeAllDevices = async function () {
  this.devices = [];
  await this.save();
};

UserSchema.plugin(softDeletePlugin);

const User: Model<IUserDocument> = mongoose.models.User || mongoose.model<IUserDocument>('User', UserSchema);

export default User;
