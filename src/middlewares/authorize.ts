import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, _res: any, next: any) => {
    if (!req.user) {
      throw new ErrorResponse('Not authenticated', 401);
    }
    if (!roles.includes(req.user.role)) {
      console.log(`[Auth Debug] Denied access. User: ${req.user.email}, Role: ${req.user.role}, Required one of: ${roles.join(', ')}`);
      throw new ErrorResponse('Not authorized to access this route', 403);
    }
    next();
  };
};

export default authorize;
