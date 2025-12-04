/**
 * Generate secure JWT secrets for .env file
 * Run with: node scripts/generateJWTSecrets.js
 */

const crypto = require('crypto');

// Generate random 64-character secrets (more than the required 32)
const jwtSecret = crypto.randomBytes(32).toString('hex');
const jwtRefreshSecret = crypto.randomBytes(32).toString('hex');

console.log('\n🔐 Generated JWT Secrets (add these to your .env file):\n');
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`JWT_REFRESH_SECRET=${jwtRefreshSecret}`);
console.log('\n✅ Both secrets are 64 characters long (exceeds the 32 character minimum requirement)\n');

