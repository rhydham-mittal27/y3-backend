import multer, { MulterError } from 'multer';
import type { Request, Response, NextFunction } from 'express';
import { UPLOAD_CONFIG } from '../config/constants';
import ErrorResponse from '../utils/errorResponse';

// Use memory storage to pass buffers to Cloudinary
const storage = multer.memoryStorage();

const fileFilter: multer.Options['fileFilter'] = (_req: Request, file: any, cb: multer.FileFilterCallback) => {
  const mimeTypeValid = UPLOAD_CONFIG.ALLOWED_FILE_TYPES.includes(file.mimetype);
  const isPdfExtension = file.originalname.toLowerCase().endsWith('.pdf');
  
  // Allow if standard mime type is valid OR if it looks like a PDF (fallback for some mobile browsers/scanners)
  if (!mimeTypeValid && !(isPdfExtension && file.mimetype === 'application/octet-stream')) {
    return cb(new ErrorResponse('Invalid file type. Allowed: JPEG, PNG, PDF', 400));
  }
  cb(null, true);
};

const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE },
});

export const uploadDocument = (req: Request, res: Response, next: NextFunction) => {
  // Accept a single file from any field name and map it to req.file
  const anyUpload = (uploader as any).any() as (req: Request, res: Response, cb: (err?: any) => void) => void;
  anyUpload(req, res, (err: any) => {
    if (!err) {
      const files = (req as any).files as any[] | Record<string, any[]> | undefined;
      let picked: any | undefined;
      if (Array.isArray(files)) {
        picked = files[0];
      } else if (files && typeof files === 'object') {
        const firstKey = Object.keys(files)[0];
        picked = firstKey ? (files as any)[firstKey]?.[0] : undefined;
      }
      if (picked) {
        (req as any).file = picked;
      }
      return next();
    }
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ErrorResponse('File too large. Max size is 10MB', 400));
      }
      return next(new ErrorResponse(err.message, 400));
    }
    if (err instanceof ErrorResponse) return next(err);
    return next(new ErrorResponse(err?.message || 'File upload error', 400));
  });
};

export const uploadMultipleDocuments = (req: Request, res: Response, next: NextFunction) => {
  const multi = uploader.array('documents', 5);
  multi(req, res, (err: any) => {
    if (!err) return next();
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ErrorResponse('File too large. Max size is 10MB', 400));
      }
      return next(new ErrorResponse(err.message, 400));
    }
    if (err instanceof ErrorResponse) return next(err);
    return next(new ErrorResponse(err?.message || 'File upload error', 400));
  });
};
