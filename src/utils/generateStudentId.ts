import crypto from 'crypto';

// Roman numeral conversion utility
function toRoman(num: number): string {
  const romanNumerals = [
    { value: 10, numeral: 'X' },
    { value: 9, numeral: 'IX' },
    { value: 5, numeral: 'V' },
    { value: 4, numeral: 'IV' },
    { value: 1, numeral: 'I' }
  ];
  
  let result = '';
  let remaining = num;
  
  for (const { value, numeral } of romanNumerals) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }
  
  return result;
}

function generateRandomAlphabets(length: number): string {
  const alphabets = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += alphabets[bytes[i] % alphabets.length];
  }
  return result;
}

function generateRandomNumbers(length: number): string {
  const numbers = '0123456789';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += numbers[bytes[i] % numbers.length];
  }
  return result;
}

export function generateStudentId(params: {
  gender: 'M' | 'F';
  classGrade: number;
}): string {
  const { gender, classGrade } = params;
  
  // Validate inputs
  if (!gender || !classGrade) {
    throw new Error('Gender and classGrade are required for student ID generation');
  }

  // S for Student
  const prefix = 'S';
  
  // Gender: M or F
  const genderCode = gender.toUpperCase();
  
  // Convert class grade to Roman numeral (1-10)
  const romanGrade = toRoman(Math.min(Math.max(classGrade, 1), 10));
  
  // Generate 3 random alphabets
  const randomAlphabets = generateRandomAlphabets(3);
  
  // Generate 2 random numbers
  const randomNumbers = generateRandomNumbers(2);
  
  return `${prefix}${genderCode}${romanGrade}${randomAlphabets}${randomNumbers}`;
}

export default generateStudentId;
