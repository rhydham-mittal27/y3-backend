import { NextFunction, Request, Response } from 'express';
import { logInfo } from '../utils/logger';

const sanitizeBody = (body: any) => {
  if (!body || typeof body !== 'object') return body;
  const clone = { ...body };
  const sensitive = ['password', 'token'];
  sensitive.forEach((k) => {
    if (k in clone) clone[k] = '***';
  });
  return clone;
};

const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const { method, originalUrl, ip } = req;
  logInfo(`Incoming Request -> ${method} ${originalUrl} - IP: ${ip}`);

  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    try {
      logInfo(`Request Body: ${JSON.stringify(sanitizeBody(req.body))}`);
    } catch {}
  }

  next();
};

export default requestLogger;
