-- Agregar campos de cambio de nombre al modelo Deal
ALTER TABLE "Deal" ADD COLUMN "cambioNombreSolicitado" BOOLEAN DEFAULT false;
ALTER TABLE "Deal" ADD COLUMN "documentacionRecibida" BOOLEAN DEFAULT false;
ALTER TABLE "Deal" ADD COLUMN "clienteAvisado" BOOLEAN DEFAULT false;
ALTER TABLE "Deal" ADD COLUMN "documentacionRetirada" BOOLEAN DEFAULT false;
