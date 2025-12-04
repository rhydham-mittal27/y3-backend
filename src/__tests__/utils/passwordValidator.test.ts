/**
 * Password Validator Unit Tests
 */

import { validatePassword } from '../../utils/passwordValidator';

describe('Password Validator', () => {
  describe('validatePassword', () => {
    it('should validate a strong password', () => {
      const result = validatePassword('StrongPass123!');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(['strong', 'very-strong']).toContain(result.strength);
    });

    it('should reject password shorter than 8 characters', () => {
      const result = validatePassword('Short1!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should reject password longer than 128 characters', () => {
      const longPassword = 'A'.repeat(129) + '1!';
      const result = validatePassword(longPassword);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be less than 128 characters');
    });

    it('should reject password without uppercase letter', () => {
      const result = validatePassword('lowercase123!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject password without lowercase letter', () => {
      const result = validatePassword('UPPERCASE123!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject password without number', () => {
      const result = validatePassword('NoNumber!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should reject password without special character', () => {
      const result = validatePassword('NoSpecial123');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('should reject common passwords', () => {
      const result = validatePassword('Password123!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password is too common');
    });

    it('should correctly assess password strength', () => {
      const weakResult = validatePassword('Weak1!');
      expect(weakResult.strength).toBe('weak');

      const mediumResult = validatePassword('Medium12!');
      expect(['medium', 'strong']).toContain(mediumResult.strength);

      const strongResult = validatePassword('VeryStrong123!@#');
      expect(['strong', 'very-strong']).toContain(strongResult.strength);
    });
  });
});

