import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, _res: any, next: any) => {
    if (!req.user) {
      throw new ErrorResponse('Not authenticated', 401);
    }
    if (!roles.includes(req.user.role)) {
      throw new ErrorResponse('Not authorized to access this route', 403);
    }
    next();
  };
};

export default authorize;
