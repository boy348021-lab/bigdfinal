// Run DB migration via Supabase REST API (pg_query via supabase-js)
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';

const SUPABASE_URL = 'https://yqhvptfbzorbgrioqoyc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxaHZwdGZiem9yYmdyaW9xb3ljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzkyMTUzNSwiZXhwIjoyMDk5NDk3NTM1fQ.UZgvlsrx6NXtBS5OV2uiOv0nJXEt_ewbRTjqHP6KumI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Split by semicolons and run each statement separately
const sql = await readFile('./migrations/20260717_update_schema.sql', 'utf-8');

// Remove comments, split into statements
const statements = sql
  .replace(/--[^\n]*/g, '')        // remove -- line comments
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 2);

let ok = 0, fail = 0;
for (const stmt of statements) {
  try {
    const { error } = await supabase.rpc('exec_migration', { sql_statement: stmt }).single().catch(() => ({ error: null }));
    // Try direct pg via REST workaround
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    });
  } catch {}
}

// Use the pg connection string approach instead
console.log('Attempting migration via pg...');
const { default: pg } = await import('pg');
const client = new pg.Client({
  host:     'db.yqhvptfbzorbgrioqoyc.supabase.co',
  port:     5432,
  database: 'postgres',
  user:     'postgres',
  password: 'nycvox-1Xabwu-gyhsaj',
  ssl:      { rejectUnauthorized: false }
});

await client.connect();
console.log('Connected to Supabase Postgres!');

for (const stmt of statements) {
  try {
    await client.query(stmt);
    console.log('✅ OK:', stmt.substring(0, 60).replace(/\s+/g, ' '));
    ok++;
  } catch (e) {
    console.warn('⚠️  SKIP:', stmt.substring(0, 60).replace(/\s+/g, ' '));
    console.warn('   Reason:', e.message);
    fail++;
  }
}

await client.end();
console.log(`\nMigration complete: ${ok} OK, ${fail} skipped/failed`);
