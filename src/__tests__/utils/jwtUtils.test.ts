/**
 * JWT Utils Unit Tests
 */

import { generateTokens, verifyAccessToken, verifyRefreshToken } from '../../utils/jwtUtils';

// Mock environment variables
const originalEnv = process.env;

beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-32chars';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only-32chars';
  process.env.JWT_EXPIRE = '7d';
  process.env.JWT_REFRESH_EXPIRE = '7d';
});

afterAll(() => {
  process.env = originalEnv;
});

describe('JWT Utils', () => {
  describe('generateTokens', () => {
    it('should generate access and refresh tokens', () => {
      const tokens = generateTokens('user123', 'test@example.com', 'USER');
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    it('should generate different tokens for different users', () => {
      const tokens1 = generateTokens('user1', 'user1@example.com', 'USER');
      const tokens2 = generateTokens('user2', 'user2@example.com', 'USER');
      expect(tokens1.accessToken).not.toBe(tokens2.accessToken);
      expect(tokens1.refreshToken).not.toBe(tokens2.refreshToken);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid access token', () => {
      const tokens = generateTokens('user123', 'test@example.com', 'USER');
      const payload = verifyAccessToken(tokens.accessToken);
      expect(payload.userId).toBe('user123');
      expect(payload.email).toBe('test@example.com');
      expect(payload.role).toBe('USER');
    });

    it('should throw error for invalid token', () => {
      expect(() => {
        verifyAccessToken('invalid-token');
      }).toThrow();
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify a valid refresh token', () => {
      const tokens = generateTokens('user123', 'test@example.com', 'USER');
      const payload = verifyRefreshToken(tokens.refreshToken);
      expect(payload.userId).toBe('user123');
    });

    it('should throw error for invalid refresh token', () => {
      expect(() => {
        verifyRefreshToken('invalid-refresh-token');
      }).toThrow();
    });
  });
});

