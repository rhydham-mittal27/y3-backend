import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import ErrorResponse from '../utils/errorResponse';
import logger, { logError } from '../utils/logger';
import { errorResponse } from '../utils/responseFormatter';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error = err;
  let statusCode = (err as ErrorResponse)?.statusCode || 500;
  let message = err.message || 'Server Error';

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

  logError(`${message} - ${err.stack || ''}`);

  if (process.env.NODE_ENV === 'development') {
    return res.status(statusCode).json({
      ...errorResponse(message, 'An error occurred'),
      stack: err.stack,
    });
  }

  return res.status(statusCode).json(errorResponse(message, 'An error occurred'));
};

export default errorHandler;
