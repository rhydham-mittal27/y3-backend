/**
 * Monitoring Middleware
 * Integrates monitoring into request pipeline
 */

import { Request, Response, NextFunction } from 'express';
import { performanceMonitor } from '../utils/monitoring';

/**
 * Performance monitoring middleware
 * Tracks request duration and performance metrics
 */
export const monitoringMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  performanceMonitor(req, res, next);
};

export default monitoringMiddleware;

