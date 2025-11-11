import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import { verifyAccessToken } from '../utils/jwtUtils';
import User from '../models/User';
import { AuthRequest } from '../types';

export const protect = asyncHandler(async (req: AuthRequest, _res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new ErrorResponse('Not authorized, no token', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId).select('-password -refreshToken');
    if (!user || user.isActive === false) {
      throw new ErrorResponse('Not authorized', 401);
    }

    req.user = {
      id: (user as any).id as string,
      name: user.name,
      email: user.email,
      role: user.role as string,
      phone: user.phone,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    next();
  } catch (err) {
    throw new ErrorResponse('Not authorized, token failed', 401);
  }
});

export default protect;
