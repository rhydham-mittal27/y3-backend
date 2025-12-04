import { NextFunction, Request, Response } from 'express';
import { logInfo } from '../utils/logger';
import { getCorrelationIdFromRequest } from '../middlewares/correlationId';

const sanitizeBody = (body: any) => {
  if (!body || typeof body !== 'object') return body;
  const clone = { ...body };
  const sensitive = ['password', 'token', 'refreshToken'];
  sensitive.forEach((k) => {
    if (k in clone) clone[k] = '***';
  });
  return clone;
};

const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const { method, originalUrl, ip } = req;
  const correlationId = getCorrelationIdFromRequest(req);
  const userAgent = req.get('user-agent') || 'unknown';
  
  logInfo(
    `Incoming Request -> ${method} ${originalUrl} - IP: ${ip}`,
    correlationId,
    {
      method,
      url: originalUrl,
      ip,
      userAgent,
    }
  );

  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    try {
      logInfo(
        `Request Body: ${JSON.stringify(sanitizeBody(req.body))}`,
        correlationId
      );
    } catch (error) {
      // Silently fail if body can't be serialized
    }
  }

  // Log response when finished
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logInfo(
      `Response -> ${method} ${originalUrl} - Status: ${res.statusCode} - Duration: ${duration}ms`,
      correlationId,
      {
        method,
        url: originalUrl,
        statusCode: res.statusCode,
        duration,
      }
    );
  });

  next();
};

export default requestLogger;
