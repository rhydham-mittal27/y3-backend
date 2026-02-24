/**
 * Environment Variable Validation
 * Validates all required environment variables on application startup
 */

interface EnvConfig {
  [key: string]: {
    required: boolean;
    type?: 'string' | 'number' | 'boolean';
    default?: string | number | boolean;
    validator?: (value: string) => boolean;
    errorMessage?: string;
  };
}

const envConfig: EnvConfig = {
  NODE_ENV: {
    required: true,
    type: 'string',
    default: 'development',
    validator: (val) => ['development', 'production', 'test'].includes(val),
    errorMessage: 'NODE_ENV must be one of: development, production, test',
  },
  PORT: {
    required: false,
    type: 'number',
    default: 5000,
    validator: (val) => {
      const port = parseInt(val, 10);
      return !isNaN(port) && port > 0 && port < 65536;
    },
    errorMessage: 'PORT must be a valid port number (1-65535)',
  },
  MONGODB_URI: {
    required: true,
    type: 'string',
    validator: (val) => val.startsWith('mongodb://') || val.startsWith('mongodb+srv://'),
    errorMessage: 'MONGODB_URI must be a valid MongoDB connection string',
  },
  JWT_SECRET: {
    required: true,
    type: 'string',
    validator: (val) => val.length >= 32,
    errorMessage: 'JWT_SECRET must be at least 32 characters long',
  },
  JWT_REFRESH_SECRET: {
    required: true,
    type: 'string',
    validator: (val) => val.length >= 32,
    errorMessage: 'JWT_REFRESH_SECRET must be at least 32 characters long',
  },
  JWT_EXPIRE: {
    required: false,
    type: 'string',
    default: '7d',
  },
  JWT_REFRESH_EXPIRE: {
    required: false,
    type: 'string',
    default: '7d',
  },
  ALLOWED_ORIGIN: {
    required: false,
    type: 'string',
    default: '*',
  },
  LOG_LEVEL: {
    required: false,
    type: 'string',
    default: 'info',
    validator: (val) => ['error', 'warn', 'info', 'debug'].includes(val),
    errorMessage: 'LOG_LEVEL must be one of: error, warn, info, debug',
  },
  CLOUDINARY_CLOUD_NAME: {
    required: false,
    type: 'string',
  },
  CLOUDINARY_API_KEY: {
    required: false,
    type: 'string',
  },
  CLOUDINARY_API_SECRET: {
    required: false,
    type: 'string',
  },
  FIREBASE_PROJECT_ID: {
    required: false,
    type: 'string',
  },
  FIREBASE_CLIENT_EMAIL: {
    required: false,
    type: 'string',
  },
  FIREBASE_PRIVATE_KEY: {
    required: false,
    type: 'string',
  },
};

export const validateEnv = (): void => {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [key, config] of Object.entries(envConfig)) {
    const value = process.env[key];

    // Check if required
    if (config.required && !value) {
      errors.push(`Missing required environment variable: ${key}`);
      continue;
    }

    // Use default if not provided
    if (!value && config.default !== undefined) {
      process.env[key] = String(config.default);
      continue;
    }

    // Skip validation if no value and not required
    if (!value) {
      continue;
    }

    // Type validation
    if (config.type === 'number') {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        errors.push(`${key} must be a number, got: ${value}`);
        continue;
      }
    } else if (config.type === 'boolean') {
      if (!['true', 'false', '1', '0'].includes(value.toLowerCase())) {
        errors.push(`${key} must be a boolean, got: ${value}`);
        continue;
      }
    }

    // Custom validator
    if (config.validator && !config.validator(value)) {
      const errorMsg = config.errorMessage || `${key} validation failed`;
      errors.push(errorMsg);
    }
  }

  // Check for JWT secrets in production
  if (process.env.NODE_ENV === 'production') {
    if (process.env.JWT_SECRET === 'your-secret-key' || process.env.JWT_SECRET === 'change-me') {
      warnings.push('JWT_SECRET appears to be using a default value. Please change it in production!');
    }
    if (process.env.JWT_REFRESH_SECRET === 'your-refresh-secret' || process.env.JWT_REFRESH_SECRET === 'change-me') {
      warnings.push('JWT_REFRESH_SECRET appears to be using a default value. Please change it in production!');
    }
    if (process.env.MONGODB_URI?.includes('localhost') || process.env.MONGODB_URI?.includes('127.0.0.1')) {
      warnings.push('MONGODB_URI appears to be pointing to localhost. Ensure this is correct for production!');
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn('\n⚠️  Environment Variable Warnings:');
    warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  // Throw errors if any
  if (errors.length > 0) {
    console.error('\n❌ Environment Variable Validation Failed:');
    errors.forEach((error) => console.error(`  - ${error}`));
    throw new Error('Environment variable validation failed. Please check your .env file.');
  }

  console.log('✅ Environment variables validated successfully');
};

export default validateEnv;

