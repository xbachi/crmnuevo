-- Mandato de gestoría generado desde la ficha del deal (autorización del
-- comprador para que la gestoría tramite la transferencia en la DGT).
-- Guarda la referencia al PDF (URL de Vercel Blob), igual que
-- "contratoReserva" / "contratoVenta".
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "mandatoGestoria" TEXT;
