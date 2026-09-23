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

export async function query(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return result.rows;
}

export async function get(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return result.rows[0] || null;
}

export async function run(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return {
    lastInsertRowid: result.lastInsertRowid,
    rowsAffected: result.rowsAffected,
  };
}