-- Tabla de audit logs para costoBeneficio
-- Registra TODAS las llamadas a notifyCostoBeneficio (éxito/error)

CREATE TABLE IF NOT EXISTS costobeneficio_logs (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES "Deal"(id),
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  invoice_type TEXT NOT NULL,
  sale_price NUMERIC(10, 2) NOT NULL,

  -- Resultado
  success BOOLEAN NOT NULL,
  action TEXT NOT NULL, -- 'inserted' | 'duplicate' | 'dry-run' | 'skipped' | 'error'
  detail TEXT NOT NULL,
  warnings TEXT[],
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  execution_time_ms INTEGER
);

CREATE INDEX idx_costobeneficio_logs_deal ON costobeneficio_logs(deal_id);
CREATE INDEX idx_costobeneficio_logs_invoice ON costobeneficio_logs(invoice_number);
CREATE INDEX idx_costobeneficio_logs_date ON costobeneficio_logs(invoice_date);
CREATE INDEX idx_costobeneficio_logs_success ON costobeneficio_logs(success, created_at);

COMMENT ON TABLE costobeneficio_logs IS 'Audit log de sincronizaciones con CB 2026';
COMMENT ON COLUMN costobeneficio_logs.success IS 'TRUE si se insertó o era duplicado, FALSE si hubo error';
COMMENT ON COLUMN costobeneficio_logs.action IS 'inserted=nueva fila, duplicate=ya existía, error=falló, skipped=DISABLED, dry-run=simulación';
