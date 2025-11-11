import { NextFunction, Request, Response } from 'express';
import ErrorResponse from '../utils/errorResponse';

const notFound = (req: Request, res: Response, next: NextFunction) => {
  const error = new ErrorResponse(`Route not found - ${req.originalUrl}`, 404);
  next(error);
};

export default notFound;
