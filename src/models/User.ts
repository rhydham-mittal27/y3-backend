import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { USER_ROLES } from '../config/constants';

export interface IUserDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: USER_ROLES | string;
  isActive: boolean;
  refreshToken?: string | null;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(enteredPassword: string): Promise<boolean>;
  generateAccessToken(): string;
  generateRefreshToken(): string;
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
    password: { type: String, required: true, minlength: 6, select: false },
    phone: { type: String },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.MANAGER,
    },
    isActive: { type: Boolean, default: true },
    refreshToken: { type: String, select: false },
  },
  { timestamps: true }
);

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

const User: Model<IUserDocument> = mongoose.models.User || mongoose.model<IUserDocument>('User', UserSchema);

export default User;
