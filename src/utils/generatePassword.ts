import crypto from 'crypto';

function generateRandomPassword(length: number = 8): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let result = '';
  const bytes = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  
  return result;
}

export function generateStudentPassword(): string {
  // Generate a 10-character password with at least one number and one special character
  const password = generateRandomPassword(10);
  
  // Ensure it has at least one number and one special character
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*]/.test(password);
  
  if (!hasNumber || !hasSpecial) {
    // Regenerate if it doesn't meet requirements
    return generateStudentPassword();
  }
  
  return password;
}

export default generateStudentPassword;
