type NodeEnv = 'development' | 'test' | 'production';

function getNodeEnv(): NodeEnv {
  const env = process.env.NODE_ENV;
  if (env === 'test' || env === 'production') return env;
  return 'development';
}

export function getCorsOrigin(): true | string[] {
  const nodeEnv = getNodeEnv();
  if (nodeEnv !== 'production') return true;

  const raw = process.env.CORS_ORIGINS ?? '';
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function getGlobalThrottleConfig() {
  const nodeEnv = getNodeEnv();
  const ttl = Number.parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10);
  const limit = Number.parseInt(
    process.env.THROTTLE_LIMIT ?? (nodeEnv === 'test' ? '999999' : '100'),
    10,
  );

  return {
    ttl: Number.isInteger(ttl) && ttl > 0 ? ttl : 60_000,
    limit: Number.isInteger(limit) && limit > 0 ? limit : 100,
  };
}

export function getAuthThrottleConfig() {
  const nodeEnv = getNodeEnv();
  const ttl = Number.parseInt(process.env.AUTH_THROTTLE_TTL_MS ?? '60000', 10);
  const limit = Number.parseInt(
    process.env.AUTH_THROTTLE_LIMIT ?? (nodeEnv === 'test' ? '999999' : '10'),
    10,
  );

  return {
    ttl: Number.isInteger(ttl) && ttl > 0 ? ttl : 60_000,
    limit: Number.isInteger(limit) && limit > 0 ? limit : 10,
  };
}
