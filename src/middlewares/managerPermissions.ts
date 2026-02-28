import { NextFunction, Response } from 'express';
import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../types';
import { USER_ROLES } from '../config/constants';
import Manager from '../models/Manager';

export type ManagerPermissionKey =
  | 'canViewSiteLeads'
  | 'canVerifyTutors'
  | 'canVerifyCoordinators'
  | 'canCreateLeads'


/**
 * Middleware factory to ensure a MANAGER has the specified permissions.
 *
 * - ADMIN and non-MANAGER roles are allowed to pass through untouched.
 *   (Those routes are still protected by role-based `authorize`.)
 * - For MANAGER role, we load the Manager profile by user id and ensure all
 *   required permission flags are truthy.
 */
export const requireManagerPermissions = (...required: ManagerPermissionKey[]) =>
  asyncHandler(async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ErrorResponse('Not authorized', 401);
    }

    // Only enforce for MANAGER role. Other roles (ADMIN, TUTOR, etc.)
    // are handled purely by the role-based `authorize` middleware.
    if (req.user.role !== USER_ROLES.MANAGER) {
      return next();
    }

    const manager = await Manager.findOne({ user: req.user.id });
    if (!manager) {
      throw new ErrorResponse('Manager profile not found', 403);
    }

    const perms: any = manager.permissions || {};
    const missing = required.filter((key) => !perms[key]);

    if (missing.length > 0) {
      throw new ErrorResponse('You do not have permission to perform this action', 403);
    }

    return next();
  });

export default requireManagerPermissions;
