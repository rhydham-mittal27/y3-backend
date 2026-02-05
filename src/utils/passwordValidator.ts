/**
 * Password Validation Utility
 * Enforces strong password policy on the backend
 */

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong' | 'very-strong';
}

/**
 * Validates password strength and returns detailed result
 */
export const validatePassword = (password: string): PasswordValidationResult => {
  const errors: string[] = [];

  // Minimum length check (only requirement)
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  // Maximum length check
  if (password.length > 128) {
    errors.push('Password must be less than 128 characters');
  }

  // Simple strength based on length only
  let strength: 'weak' | 'medium' | 'strong' | 'very-strong';
  if (password.length < 8) {
    strength = 'weak';
  } else if (password.length < 12) {
    strength = 'medium';
  } else if (password.length < 16) {
    strength = 'strong';
  } else {
    strength = 'very-strong';
  }

  return {
    isValid: errors.length === 0,
    errors,
    strength,
  };
};

export default validatePassword;

