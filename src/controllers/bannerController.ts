import { Response } from 'express';
import { AuthRequest } from '../types';
import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import { successResponse } from '../utils/responseFormatter';
import Banner from '../models/Banner';
import FinalClass from '../models/FinalClass';
import { uploadFileToS3Structured, getPresignedUrl } from '../services/s3Service';

// POST /api/banners — admin or coordinator creates a banner
export const createBanner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const file = (req as any).file;
  if (!file) throw new ErrorResponse('Banner image is required', 400);

  const { expiresAt } = req.body;
  if (!expiresAt) throw new ErrorResponse('Expiry date/time is required', 400);

  const expiry = new Date(expiresAt);
  if (isNaN(expiry.getTime()) || expiry <= new Date()) {
    throw new ErrorResponse('expiresAt must be a valid future date', 400);
  }

  const role = user.role as string;
  if (role !== 'ADMIN' && role !== 'COORDINATOR') {
    throw new ErrorResponse('Only admins and coordinators can create banners', 403);
  }

  const { key, url } = await uploadFileToS3Structured(
    file.buffer,
    file.originalname,
    file.mimetype,
    { entityType: 'managers', entityId: String(user.id), folder: 'banners' }
  );

  const banner = await Banner.create({
    imageUrl: url,
    s3Key: key,
    uploaderName: user.name || 'Unknown',
    uploaderRole: role === 'ADMIN' ? 'ADMIN' : 'COORDINATOR',
    uploadedBy: user.id,
    coordinatorUserId: role === 'COORDINATOR' ? user.id : null,
    expiresAt: expiry,
    isActive: true,
  });

  return res.status(201).json(successResponse(banner, 'Banner created'));
});

// GET /api/banners/active — tutor-facing: returns banners visible to this tutor
export const getActiveBannersForTutor = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tutorUserId = req.user!.id;

  // Find all coordinator user IDs linked to this tutor's classes
  const classes = await FinalClass.find({ tutor: tutorUserId, coordinator: { $exists: true, $ne: null } })
    .select('coordinator')
    .lean();
  const coordinatorIds = [...new Set(classes.map((c) => String(c.coordinator)).filter(Boolean))];

  const now = new Date();
  const banners = await Banner.find({
    isActive: true,
    expiresAt: { $gt: now },
    $or: [
      { uploaderRole: 'ADMIN' },
      { uploaderRole: 'COORDINATOR', coordinatorUserId: { $in: coordinatorIds } },
    ],
  })
    .sort({ createdAt: -1 })
    .lean();

  const bannersWithSignedUrls = await Promise.all(
    banners.map(async (b) => {
      try {
        const signedUrl = await getPresignedUrl(b.s3Key, 3600);
        return { ...b, imageUrl: signedUrl };
      } catch {
        return b;
      }
    })
  );

  return res.json(successResponse(bannersWithSignedUrls));
});

// GET /api/banners — admin/coordinator management list
export const getBanners = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const role = user.role as string;

  const filter: Record<string, any> = {};
  if (role === 'COORDINATOR') {
    filter.uploadedBy = user.id;
  }

  const banners = await Banner.find(filter).sort({ createdAt: -1 }).lean();
  return res.json(successResponse(banners));
});

// DELETE /api/banners/:id — deactivate a banner
export const deleteBanner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const banner = await Banner.findById(req.params.id);
  if (!banner) throw new ErrorResponse('Banner not found', 404);

  const role = user.role as string;
  if (role !== 'ADMIN' && String(banner.uploadedBy) !== String(user.id)) {
    throw new ErrorResponse('Not authorized to delete this banner', 403);
  }

  banner.isActive = false;
  await banner.save();
  return res.json(successResponse(null, 'Banner deactivated'));
});
