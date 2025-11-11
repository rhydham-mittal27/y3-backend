import { RequestHandler } from 'express';

const asyncHandler = <P = any, ResBody = any, ReqBody = any, ReqQuery = any>(
  fn: RequestHandler<P, ResBody, ReqBody, ReqQuery>
): RequestHandler<P, ResBody, ReqBody, ReqQuery> => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;
