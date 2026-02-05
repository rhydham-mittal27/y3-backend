import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  email?: string;
  role?: string;
  iat: number;
  exp: number;
}

export const generateTokens = (userId: string, email: string, role: string) => {
  const accessSecret = process.env.JWT_SECRET as string;
  const refreshSecret = process.env.JWT_REFRESH_SECRET as string;
  const accessExpiresIn = '7d'; // Force 7 days as requested
  const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN as string;

  const accessOptions: jwt.SignOptions = { expiresIn: accessExpiresIn as unknown as jwt.SignOptions['expiresIn'] };
  const refreshOptions: jwt.SignOptions = { expiresIn: refreshExpiresIn as unknown as jwt.SignOptions['expiresIn'] };

  const accessToken = jwt.sign({ userId, email, role }, accessSecret as jwt.Secret, accessOptions);
  const refreshToken = jwt.sign({ userId }, refreshSecret as jwt.Secret, refreshOptions);

  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token: string): TokenPayload => {
  const accessSecret = process.env.JWT_SECRET as string;
  return jwt.verify(token, accessSecret as jwt.Secret) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  const refreshSecret = process.env.JWT_REFRESH_SECRET as string;
  return jwt.verify(token, refreshSecret as jwt.Secret) as TokenPayload;
};
