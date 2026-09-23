import { connect } from '@tursodatabase/serverless';

const conn = connect({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function query(sql, params = []) {
  const stmt = conn.prepare(sql);
  const result = await stmt.all(params);
  return result;
}

export async function get(sql, params = []) {
  const stmt = conn.prepare(sql);
  const result = await stmt.get(params);
  return result;
}

export async function run(sql, params = []) {
  const stmt = conn.prepare(sql);
  const result = await stmt.run(params);
  return {
    lastInsertRowid: result.lastInsertRowid,
    rowsAffected: result.rowsAffected,
  };
}