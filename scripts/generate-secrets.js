#!/usr/bin/env node

/**
 * Premium Retail POS — Secret Key Generator
 * Generates cryptographically secure random secrets for environment variables
 * 
 * Usage: node scripts/generate-secrets.js
 */

const crypto = require('crypto');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║        Premium Retail POS — Secret Key Generator              ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

/**
 * Generate a cryptographically secure random string
 * @param {number} length - Length in bytes
 * @param {string} encoding - Encoding format ('hex' or 'base64')
 * @returns {string}
 */
function generateSecret(length = 32, encoding = 'hex') {
  return crypto.randomBytes(length).toString(encoding);
}

// Generate all required secrets
const secrets = {
  JWT_SECRET: generateSecret(32, 'base64'),
  JWT_REFRESH_SECRET: generateSecret(32, 'base64'),
  QR_SIGNING_SECRET: generateSecret(32, 'hex'),
  SESSION_SECRET: generateSecret(24, 'hex'),
};

// Display formatted output
console.log('Copy these values to your .env files:\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

for (const [key, value] of Object.entries(secrets)) {
  console.log(`${key}=${value}`);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Additional database password suggestion
console.log('Optional: Strong PostgreSQL password suggestion:');
console.log(`DATABASE_PASSWORD=${generateSecret(16, 'base64')}\n`);

console.log('⚠️  Security Notes:');
console.log('   • Never commit these secrets to version control');
console.log('   • Store production secrets in secure vault (AWS Secrets Manager, etc.)');
console.log('   • Rotate secrets periodically (every 90 days recommended)');
console.log('   • Use different secrets for each environment (dev, staging, prod)\n');

console.log('✅ Secrets generated successfully!\n');
