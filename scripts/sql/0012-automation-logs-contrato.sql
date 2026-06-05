-- 0012 — Suma "contrato_enviado" al registro de automatizaciones: si el mail a
-- la gestora pudo incluir también el contrato de venta (además de la factura).
-- Idempotente.
ALTER TABLE automation_logs ADD COLUMN IF NOT EXISTS contrato_enviado BOOLEAN;
