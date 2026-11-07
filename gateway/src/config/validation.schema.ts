import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  GATEWAY_PORT: Joi.number().default(3000),

  // Database — required
  DATABASE_URL: Joi.string().uri().required(),

  // Redis — required
  REDIS_URL: Joi.string().required(),

  // JWT — required in production
  JWT_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().default('dev_secret_change_in_production'),
  }),
  JWT_EXPIRES_IN: Joi.string().default('7d'),

  // AI Brain
  AI_BRAIN_HOST: Joi.string().default('localhost'),
  AI_BRAIN_PORT: Joi.number().default(8000),

  // CORS
  GATEWAY_CORS_ORIGINS: Joi.string().default('http://localhost:3001'),

  // Qdrant
  QDRANT_URL: Joi.string().uri().default('http://localhost:6333'),

  // Admin credentials
  ADMIN_USERNAME:      Joi.string().default('admin'),
  ADMIN_PASSWORD:      Joi.string().default('changeme'),          // plain, dev only
  ADMIN_PASSWORD_HASH: Joi.string().allow('').default(''),        // bcrypt hash, production
});
