import User from '../models/User';
import Parent from '../models/Parent';
import ParentLead from '../models/ParentLead';
import ErrorResponse from '../utils/errorResponse';
import { USER_ROLES } from '../config/constants';

interface RegisterParentInput {
  name: string;
  email: string;
  password: string;
  phone: string;
  city?: string;
  primaryStudentName?: string;
  primaryStudentGrade?: string;
  notes?: string;
  source?: string;
}

export const registerParentUser = async (input: RegisterParentInput) => {
  const { name, email, password, phone, city, primaryStudentName, primaryStudentGrade, notes, source = 'MOBILE_APP' } = input;

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    throw new ErrorResponse('An account with this email already exists', 409);
  }

  const user = await User.create({
    name,
    email,
    password,
    phone,
    city,
    role: USER_ROLES.PARENT,
    isActive: true,
    acceptedTerms: true,
  });

  const parent = await Parent.create({
    user: user._id,
    primaryStudentName,
    primaryStudentGrade,
    notes,
    source,
  });

  // If a ParentLead with this email exists, link it
  await ParentLead.findOneAndUpdate(
    { parentEmail: email.toLowerCase().trim() },
    { user: user._id, status: 'ENROLLED' }
  );

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  user.refreshToken = refreshToken;
  await user.save();

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
    parent: {
      id: parent._id,
      primaryStudentName: parent.primaryStudentName,
      primaryStudentGrade: parent.primaryStudentGrade,
    },
    accessToken,
    refreshToken,
  };
};

export const getParentProfile = async (userId: string) => {
  const parent = await Parent.findOne({ user: userId })
    .populate('user', 'name email phone city role isActive createdAt')
    .populate('children');

  if (!parent) {
    throw new ErrorResponse('Parent profile not found', 404);
  }

  return parent;
};
