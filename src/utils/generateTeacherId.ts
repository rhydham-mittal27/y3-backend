import crypto from 'crypto';

function randChars(length = 6) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

export function generateTeacherId(gender?: string, city?: string) {
  const prefix = 'T';
  const g = (gender || '').toString().trim();
  const genderInitial = g ? g[0].toUpperCase() : 'X';
  const cityCode = (city ? city.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) : 'XXX');
  const random = randChars(6);
  return `${prefix}${genderInitial}${cityCode}${random}`;
}

export function generateTeacherIdWithCityCode(gender?: string, cityCode?: string, city?: string) {
  const prefix = 'T';
  const g = (gender || '').toString().trim();
  const genderInitial = g ? g[0].toUpperCase() : 'X';
  const code = (cityCode && String(cityCode).trim())
    ? String(cityCode).trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)
    : (city ? city.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) : 'XXX');
  const random = randChars(6);
  return `${prefix}${genderInitial}${code}${random}`;
}

export default generateTeacherId;
