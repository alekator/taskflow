type NodeEnv = 'development' | 'test' | 'production';

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

function parseNodeEnv(env: EnvMap): NodeEnv {
  const raw = asString(env.NODE_ENV) ?? 'development';
  if (raw === 'development' || raw === 'test' || raw === 'production') {
    return raw;
  }
  throw new Error('NODE_ENV must be one of: development, test, production');
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
  };

  if (nodeEnv === 'production') {
    const origins = parseCorsOrigins(env.CORS_ORIGINS);
    if (origins.length === 0) {
      throw new Error('CORS_ORIGINS must be set in production');
    }
  }

  return env;
}
