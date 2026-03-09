type NodeEnv = 'development' | 'test' | 'production';
type InviteEmailProvider = 'simulated' | 'smtp';

type EnvMap = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireString(env: EnvMap, key: string, minLength = 1): string {
  const value = asString(env[key]);
  if (!value || value.length < minLength) {
    throw new Error(
      `${key} must be set${minLength > 1 ? ` (min ${minLength} chars)` : ''}`,
    );
  }
  return value;
}

function parseIntOrDefault(
  env: EnvMap,
  key: string,
  fallback: number,
  min = 1,
): number {
  const raw = asString(env[key]);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${key} must be an integer >= ${min}`);
  }
  return parsed;
}

function parseNumberOrDefault(
  env: EnvMap,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = asString(env[key]);
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} must be a number in range [${min}, ${max}]`);
  }
  return parsed;
}

function parseNodeEnv(env: EnvMap): NodeEnv {
  const raw = asString(env.NODE_ENV) ?? 'development';
  if (raw === 'development' || raw === 'test' || raw === 'production') {
    return raw;
  }
  throw new Error('NODE_ENV must be one of: development, test, production');
}

function parseInviteEmailProvider(env: EnvMap): InviteEmailProvider {
  const raw = (
    asString(env.INVITE_EMAIL_PROVIDER) ?? 'simulated'
  ).toLowerCase();
  if (raw === 'simulated' || raw === 'smtp') {
    return raw;
  }
  throw new Error('INVITE_EMAIL_PROVIDER must be one of: simulated, smtp');
}

function parseCorsOrigins(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function validateEnv(config: EnvMap) {
  const nodeEnv = parseNodeEnv(config);

  const env = {
    NODE_ENV: nodeEnv,
    PORT: parseIntOrDefault(config, 'PORT', 3001),
    DATABASE_URL: requireString(config, 'DATABASE_URL'),
    JWT_ACCESS_SECRET: requireString(config, 'JWT_ACCESS_SECRET', 16),
    JWT_REFRESH_SECRET: requireString(config, 'JWT_REFRESH_SECRET', 16),
    CORS_ORIGINS: asString(config.CORS_ORIGINS) ?? '',
    THROTTLE_TTL_MS: parseIntOrDefault(config, 'THROTTLE_TTL_MS', 60_000),
    THROTTLE_LIMIT: parseIntOrDefault(
      config,
      'THROTTLE_LIMIT',
      nodeEnv === 'test' ? 999_999 : 100,
    ),
    AUTH_THROTTLE_TTL_MS: parseIntOrDefault(
      config,
      'AUTH_THROTTLE_TTL_MS',
      60_000,
    ),
    AUTH_THROTTLE_LIMIT: parseIntOrDefault(
      config,
      'AUTH_THROTTLE_LIMIT',
      nodeEnv === 'test' ? 999_999 : 10,
    ),
    AUTH_LOGIN_MAX_ATTEMPTS: parseIntOrDefault(
      config,
      'AUTH_LOGIN_MAX_ATTEMPTS',
      5,
    ),
    AUTH_LOGIN_LOCK_MINUTES: parseIntOrDefault(
      config,
      'AUTH_LOGIN_LOCK_MINUTES',
      15,
    ),
    ASSISTANT_OPENAI_API_KEY: asString(config.ASSISTANT_OPENAI_API_KEY) ?? '',
    ASSISTANT_OPENAI_MODEL:
      asString(config.ASSISTANT_OPENAI_MODEL) ?? 'gpt-4o-mini',
    ASSISTANT_OPENAI_BASE_URL:
      asString(config.ASSISTANT_OPENAI_BASE_URL) ?? 'https://api.openai.com/v1',
    ASSISTANT_DAILY_LIMIT: parseIntOrDefault(
      config,
      'ASSISTANT_DAILY_LIMIT',
      25,
    ),
    ASSISTANT_MAX_OUTPUT_TOKENS: parseIntOrDefault(
      config,
      'ASSISTANT_MAX_OUTPUT_TOKENS',
      350,
    ),
    ASSISTANT_LLM_TIMEOUT_MS: parseIntOrDefault(
      config,
      'ASSISTANT_LLM_TIMEOUT_MS',
      15_000,
    ),
    ASSISTANT_TEMPERATURE: parseNumberOrDefault(
      config,
      'ASSISTANT_TEMPERATURE',
      0.2,
      0,
      2,
    ),
    JOBS_POLL_INTERVAL_MS: parseIntOrDefault(
      config,
      'JOBS_POLL_INTERVAL_MS',
      4_000,
    ),
    JOBS_BATCH_SIZE: parseIntOrDefault(config, 'JOBS_BATCH_SIZE', 20),
    INVITE_EMAIL_PROVIDER: parseInviteEmailProvider(config),
    INVITE_EMAIL_FROM:
      asString(config.INVITE_EMAIL_FROM) ??
      'TaskFlow <no-reply@taskflow.local>',
    INVITE_SMTP_HOST: asString(config.INVITE_SMTP_HOST) ?? '',
    INVITE_SMTP_PORT: parseIntOrDefault(config, 'INVITE_SMTP_PORT', 587),
    INVITE_SMTP_SECURE: asString(config.INVITE_SMTP_SECURE) ?? 'false',
    INVITE_SMTP_USER: asString(config.INVITE_SMTP_USER) ?? '',
    INVITE_SMTP_PASS: asString(config.INVITE_SMTP_PASS) ?? '',
    ATTACHMENTS_ALLOWED_MIME:
      asString(config.ATTACHMENTS_ALLOWED_MIME) ??
      'image/png,image/jpeg,image/webp,application/pdf,text/plain',
  };

  if (nodeEnv === 'production') {
    const origins = parseCorsOrigins(env.CORS_ORIGINS);
    if (origins.length === 0) {
      throw new Error('CORS_ORIGINS must be set in production');
    }

    if (env.INVITE_EMAIL_PROVIDER === 'smtp' && !env.INVITE_SMTP_HOST) {
      throw new Error(
        'INVITE_SMTP_HOST must be set when INVITE_EMAIL_PROVIDER=smtp',
      );
    }
  }

  return env;
}
