#!/usr/bin/env node
/**
 * Diagnostic-only script: tries to connect to Postgres using DATABASE_URL
 * from the environment and reports exactly what fails.
 *
 * Usage (PowerShell):
 *   $env:DATABASE_URL = "postgresql://postgres.noginntespqylxguotgf:TU_PASSWORD@aws-1-eu-north-1.pooler.supabase.com:6543/postgres"
 *   node scripts/test-db-connection.js
 *
 * The script never prints the password. It reports:
 *  - the parsed components of the URL
 *  - whether the host resolves
 *  - whether TCP connects
 *  - whether the auth + a trivial query succeed
 *  - whether the expected tables exist
 */

const { Client } = require('pg');
const dns = require('dns').promises;
const net = require('net');

const raw = process.env.DATABASE_URL;

if (!raw) {
  console.error('ERROR: DATABASE_URL is not set in the environment.');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(raw);
} catch (e) {
  console.error('ERROR: DATABASE_URL is not a valid URL:', e.message);
  process.exit(1);
}

const masked = `${parsed.protocol}//${parsed.username}:***@${parsed.hostname}:${parsed.port}${parsed.pathname}`;
console.log('--- DATABASE_URL parsed (password masked) ---');
console.log('  full:    ', masked);
console.log('  protocol:', parsed.protocol);
console.log('  username:', parsed.username);
console.log('  host:    ', parsed.hostname);
console.log('  port:    ', parsed.port);
console.log('  database:', parsed.pathname.replace('/', ''));
console.log('  pwd len: ', parsed.password.length, 'chars');
console.log('');

const checks = {
  protocolOk: parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:',
  usernameHasProjectRef: parsed.username.includes('.'),
  isPooler: parsed.hostname.includes('pooler.supabase.com'),
  poolerPort: parsed.port === '6543',
  hasPassword: parsed.password.length > 0,
  passwordLooksLikePlaceholder:
    parsed.password.includes('[') ||
    parsed.password.toUpperCase() === 'YOUR-PASSWORD' ||
    parsed.password.toUpperCase() === 'PASSWORD',
};

console.log('--- Sanity checks ---');
console.log('  protocol is postgresql:                ', checks.protocolOk ? 'OK' : 'FAIL');
console.log('  username contains project ref (".")   :', checks.usernameHasProjectRef ? 'OK' : 'WARN (pooler needs postgres.<ref>)');
console.log('  host is the pooler                    :', checks.isPooler ? 'OK' : 'WARN (not a Supabase pooler)');
console.log('  port is 6543 (transaction pooler)     :', checks.poolerPort ? 'OK' : 'WARN');
console.log('  password not empty                    :', checks.hasPassword ? 'OK' : 'FAIL');
console.log('  password is NOT the placeholder       :', checks.passwordLooksLikePlaceholder ? 'FAIL (still says [YOUR-PASSWORD])' : 'OK');
console.log('');

(async () => {
  try {
    const addrs = await dns.lookup(parsed.hostname, { all: true });
    console.log('--- DNS ---');
    console.log('  resolved:', addrs.map((a) => a.address).join(', '));
  } catch (e) {
    console.error('--- DNS FAILED ---');
    console.error(' ', e.message);
    process.exit(2);
  }

  await new Promise((resolve) => {
    const sock = net.createConnection({ host: parsed.hostname, port: Number(parsed.port), timeout: 5000 });
    sock.once('connect', () => {
      console.log('--- TCP ---\n  connect: OK');
      sock.destroy();
      resolve();
    });
    sock.once('timeout', () => {
      console.error('--- TCP ---\n  connect: TIMEOUT');
      sock.destroy();
      resolve();
    });
    sock.once('error', (e) => {
      console.error('--- TCP ---\n  connect: FAIL ' + e.message);
      resolve();
    });
  });

  const client = new Client({ connectionString: raw, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log('--- Auth ---\n  login: OK');
  } catch (e) {
    console.error('--- Auth FAILED ---');
    console.error(' ', e.message);
    if (/password/i.test(e.message)) {
      console.error('  >>> The password in DATABASE_URL is incorrect or has special chars that need URL-encoding.');
    }
    process.exit(3);
  }

  try {
    const r = await client.query('select current_user, current_database(), version()');
    console.log('  current_user:    ', r.rows[0].current_user);
    console.log('  current_database:', r.rows[0].current_database);
    console.log('  postgres version:', r.rows[0].version.split(' ').slice(0, 2).join(' '));
  } catch (e) {
    console.error('  query failed:', e.message);
  }

  try {
    const tablesRes = await client.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `);
    const names = tablesRes.rows.map((r) => r.table_name);
    console.log('--- Schema ---');
    console.log('  tables in public:', names.length === 0 ? '(none)' : names.join(', '));
    const expected = ['Vehiculo', 'Cliente', 'Inversor', 'Deal', 'NotaCliente'];
    const presentLower = names.map((n) => n.toLowerCase());
    const missing = expected.filter((e) => !presentLower.includes(e.toLowerCase()));
    if (missing.length === 0) {
      console.log('  expected models: all present');
    } else {
      console.log('  MISSING (case-insensitive):', missing.join(', '));
    }
  } catch (e) {
    console.error('  schema query failed:', e.message);
  }

  await client.end();
  console.log('\n--- DONE ---');
})();
