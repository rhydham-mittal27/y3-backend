import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import ErrorResponse from '../utils/errorResponse';
import { logError } from '../utils/logger';
import { getCorrelationIdFromRequest } from '../middlewares/correlationId';
import { errorResponse } from '../utils/responseFormatter';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = (err as ErrorResponse)?.statusCode || 500;
  let message = err.message || 'Server Error';
  const correlationId = getCorrelationIdFromRequest(req);

  // Mongoose bad ObjectId
  if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = 'Resource not found';
  }

  // Mongoose validation error
  if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
  }

  // Mongo duplicate key
  if (err && (err.code === 11000 || err.code === 11001)) {
    statusCode = 409;
    message = 'Duplicate field value';
  }

  // JWT errors
  if (err instanceof JsonWebTokenError) {
    statusCode = 401;
    message = 'Invalid token';
  }
  if (err instanceof TokenExpiredError) {
    statusCode = 401;
    message = 'Token expired';
  }

  // Log error with correlation ID and metadata
  logError(
    `${message} - ${err.stack || ''}`,
    correlationId,
    {
      statusCode,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    }
  );

  // Include correlation ID in error response
  const errorResponseData = {
    ...errorResponse(message, 'An error occurred'),
    correlationId,
  };

  if (process.env.NODE_ENV === 'development') {
    return res.status(statusCode).json({
      ...errorResponseData,
      stack: err.stack,
    });
  }

  return res.status(statusCode).json(errorResponseData);
};

export default errorHandler;
