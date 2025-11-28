import crypto from 'crypto';

const CITY_CODE: Record<string, string> = {
  Bhopal: 'BPL',
};

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
  const cityCode = (city && CITY_CODE[city]) ? CITY_CODE[city] : (city ? city.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) : 'XXX');
  const random = randChars(6);
  return `${prefix}${genderInitial}${cityCode}${random}`;
}

export default generateTeacherId;
