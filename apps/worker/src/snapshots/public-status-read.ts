const SNAPSHOT_KEY = 'status';
const MAX_AGE_SECONDS = 60;
const MAX_STALE_SECONDS = 10 * 60;

const READ_STATUS_SQL = `
  SELECT generated_at, body_json
  FROM public_snapshots
  WHERE key = ?1
`;

const readStatusStatementByDb = new WeakMap<D1Database, D1PreparedStatement>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function looksLikeStatusPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const maintenance = value.maintenance_windows;
  return (
    typeof value.generated_at === 'number' &&
    typeof value.site_title === 'string' &&
    typeof value.site_description === 'string' &&
    typeof value.site_locale === 'string' &&
    typeof value.site_timezone === 'string' &&
    typeof value.uptime_rating_level === 'number' &&
    typeof value.overall_status === 'string' &&
    isRecord(value.banner) &&
    isRecord(value.summary) &&
    Array.isArray(value.monitors) &&
    Array.isArray(value.active_incidents) &&
    isRecord(maintenance) &&
    Array.isArray(maintenance.active) &&
    Array.isArray(maintenance.upcoming)
  );
}

function safeJsonParse(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

async function readStatusSnapshotRow(
  db: D1Database,
): Promise<{ generated_at: number; body_json: string } | null> {
  const cached = readStatusStatementByDb.get(db);
  const statement = cached ?? db.prepare(READ_STATUS_SQL);
  if (!cached) {
    readStatusStatementByDb.set(db, statement);
  }

  return await statement
    .bind(SNAPSHOT_KEY)
    .first<{ generated_at: number; body_json: string }>();
}

export async function readStatusSnapshotJson(
  db: D1Database,
  now: number,
): Promise<{ bodyJson: string; age: number } | null> {
  try {
    const row = await readStatusSnapshotRow(db);
    if (!row) return null;

    const age = Math.max(0, now - row.generated_at);
    if (age > MAX_AGE_SECONDS) return null;

    const parsed = safeJsonParse(row.body_json);
    if (parsed === null) {
      console.warn('public snapshot: invalid JSON, falling back to live');
      return null;
    }
    if (!looksLikeStatusPayload(parsed)) {
      console.warn('public snapshot: invalid payload, falling back to live');
      return null;
    }

    return { bodyJson: row.body_json, age };
  } catch (err) {
    console.warn('public snapshot: read failed, falling back to live', err);
    return null;
  }
}

export async function readStaleStatusSnapshotJson(
  db: D1Database,
  now: number,
  maxStaleSeconds = MAX_STALE_SECONDS,
): Promise<{ bodyJson: string; age: number } | null> {
  try {
    const row = await readStatusSnapshotRow(db);
    if (!row) return null;

    const age = Math.max(0, now - row.generated_at);
    if (age > maxStaleSeconds) return null;

    const parsed = safeJsonParse(row.body_json);
    if (parsed === null) return null;
    if (!looksLikeStatusPayload(parsed)) return null;

    return { bodyJson: row.body_json, age };
  } catch {
    return null;
  }
}

export function applyStatusCacheHeaders(res: Response, ageSeconds: number): void {
  const remaining = Math.max(0, MAX_AGE_SECONDS - ageSeconds);
  const maxAge = Math.min(30, remaining);
  const stale = Math.max(0, remaining - maxAge);

  res.headers.set(
    'Cache-Control',
    `public, max-age=${maxAge}, stale-while-revalidate=${stale}, stale-if-error=${stale}`,
  );
}
