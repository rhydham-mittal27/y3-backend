/**
 * Input Sanitization Middleware
 * Sanitizes user inputs to prevent XSS and injection attacks
 */

import { Request, Response, NextFunction } from 'express';

// Sanitize string values
const sanitizeString = (value: any): any => {
  if (typeof value === 'string') {
    // Remove potentially dangerous characters
    return value
      .trim()
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, ''); // Remove event handlers
  }
  return value;
};

// Recursively sanitize object
const sanitizeObject = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Skip password fields - they should be hashed, not sanitized
        if (key.toLowerCase().includes('password') || key.toLowerCase().includes('token')) {
          sanitized[key] = obj[key];
        } else {
          sanitized[key] = sanitizeObject(obj[key]);
        }
      }
    }
    return sanitized;
  }

  return obj;
};

/**
 * Sanitize request body, query, and params
 */
const sanitizeInput = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  if (req.query) {
    req.query = sanitizeObject(req.query) as any;
  }

  if (req.params) {
    req.params = sanitizeObject(req.params) as any;
  }

  next();
};

export default sanitizeInput;

