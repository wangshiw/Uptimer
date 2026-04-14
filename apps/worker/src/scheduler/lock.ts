export async function acquireLease(
  db: D1Database,
  name: string,
  now: number,
  leaseSeconds: number,
): Promise<boolean> {
  const expiresAt = now + leaseSeconds;

  const cached = acquireLeaseStatementByDb.get(db);
  const statement = cached ?? db.prepare(ACQUIRE_LEASE_SQL);
  if (!cached) {
    acquireLeaseStatementByDb.set(db, statement);
  }

  const r = await statement.bind(name, expiresAt, now).run();

  return (r.meta.changes ?? 0) > 0;
}

const ACQUIRE_LEASE_SQL = `
  INSERT INTO locks (name, expires_at)
  VALUES (?1, ?2)
  ON CONFLICT(name) DO UPDATE SET expires_at = excluded.expires_at
  WHERE locks.expires_at <= ?3
`;

const acquireLeaseStatementByDb = new WeakMap<D1Database, D1PreparedStatement>();
