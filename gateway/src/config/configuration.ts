export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.GATEWAY_PORT ?? '3000', 10),

  database: {
    url: process.env.DATABASE_URL,
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
    user: process.env.POSTGRES_USER ?? 'aios',
    password: process.env.POSTGRES_PASSWORD ?? '',
    name: process.env.POSTGRES_DB ?? 'aios',
  },

  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD ?? '',
  },

  qdrant: {
    url: process.env.QDRANT_URL ?? 'http://localhost:6333',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },

  cors: {
    origins: (process.env.GATEWAY_CORS_ORIGINS ?? 'http://localhost:3001').split(','),
  },

  aiBrain: {
    url: `http://${process.env.AI_BRAIN_HOST ?? 'localhost'}:${process.env.AI_BRAIN_PORT ?? '8000'}`,
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY ?? '',
  },

  admin: {
    username:     process.env.ADMIN_USERNAME     ?? 'admin',
    password:     process.env.ADMIN_PASSWORD     ?? 'changeme',   // dev only
    passwordHash: process.env.ADMIN_PASSWORD_HASH ?? '',          // bcrypt hash for prod
  },

  providers: {
    anthropic: process.env.ANTHROPIC_API_KEY ?? '',
    openai: process.env.OPENAI_API_KEY ?? '',
    google: process.env.GOOGLE_API_KEY ?? '',
    deepseek: process.env.DEEPSEEK_API_KEY ?? '',
    grok: process.env.GROK_API_KEY ?? '',
    mistral: process.env.MISTRAL_API_KEY ?? '',
    ollama: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  },
});
