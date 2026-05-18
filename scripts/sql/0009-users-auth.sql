-- 0009-users-auth.sql
-- Tabla users para autenticación real server-side.
-- Reemplaza las credenciales hardcoded en src/contexts/AuthContext.tsx.
--
-- password_hash usa scrypt (Node built-in crypto, sin dependencias nuevas):
--   formato: "scrypt:<salt_hex>:<hash_hex>"
--   scrypt N=16384 r=8 p=1 keylen=64

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'asesor')),
  display_name    TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE active = TRUE;

COMMIT;
