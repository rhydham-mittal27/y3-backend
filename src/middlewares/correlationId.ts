/**
 * Correlation ID Middleware
 * Generates and manages correlation IDs for request tracking
 */

import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Get correlation ID from request or generate new one
 */
export const getCorrelationId = (req: Request): string => {
  const correlationId = req.headers[CORRELATION_ID_HEADER] as string;
  if (correlationId) {
    return correlationId;
  }
  return randomUUID();
};

/**
 * Middleware to add correlation ID to request
 */
export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const correlationId = getCorrelationId(req);
  
  // Add to request for use in handlers
  (req as any).correlationId = correlationId;
  
  // Add to response headers
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  
  next();
};

/**
 * Get correlation ID from request object
 */
export const getCorrelationIdFromRequest = (req: Request): string => {
  return (req as any).correlationId || getCorrelationId(req);
};

export default correlationIdMiddleware;

