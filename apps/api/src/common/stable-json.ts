type JsonLike =
  | null
  | boolean
  | number
  | string
  | JsonLike[]
  | { [key: string]: JsonLike };

function normalize(value: unknown): JsonLike {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );

    return Object.fromEntries(
      entries.map(([key, nested]) => [key, normalize(nested)]),
    ) as JsonLike;
  }

  return null;
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}
