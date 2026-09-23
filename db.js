import { setGlobalDispatcher, Agent } from 'undici';
import { createClient } from '@libsql/client';
import 'dotenv/config';

// Increase connect timeout from default 10s to 30s
setGlobalDispatcher(new Agent({
  connectTimeout: 30000,
  keepAliveTimeout: 60000,
  keepAliveMaxTimeout: 120000,
}));

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Convert BigInt values to Number so JSON.stringify doesn't crash
function safe(value) {
  if (typeof value === 'bigint') return Number(value);
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(safe);
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = safe(value[k]);
    return out;
  }
  return value;
}

export async function query(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return safe(result.rows);
}

export async function get(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  const row = result.rows[0];
  return row ? safe(row) : null;
}

export async function run(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return {
    lastInsertRowid: typeof result.lastInsertRowid === 'bigint'
      ? Number(result.lastInsertRowid)
      : result.lastInsertRowid,
    rowsAffected: typeof result.rowsAffected === 'bigint'
      ? Number(result.rowsAffected)
      : result.rowsAffected,
  };
}