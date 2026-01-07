-- Invoice ingestion & accounting tables
-- This migration only ADDS new tables/enums used by the invoice ingestion pipeline.

-- Enums
DO $$ BEGIN
  CREATE TYPE "InvoiceSource" AS ENUM ('ONEDRIVE', 'OUTLOOK', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AccountingDocStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'DUPLICATE', 'PENDING', 'NEEDS_REVIEW', 'ERROR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ExpenseCategory" AS ENUM ('limpieza', 'pintura', 'taller', 'transporte', 'gestoria', 'otro');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Vendors
CREATE TABLE IF NOT EXISTS "AccountingVendor" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "nif" TEXT UNIQUE,
  "iban" TEXT UNIQUE,
  "keywords" JSONB,
  "defaultCategory" "ExpenseCategory",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Documents (ingested PDFs)
CREATE TABLE IF NOT EXISTS "AccountingDocument" (
  "id" SERIAL PRIMARY KEY,
  "source" "InvoiceSource" NOT NULL,
  "oneDriveItemId" TEXT UNIQUE,
  "oneDrivePath" TEXT,
  "originalFilename" TEXT NOT NULL,
  "sha256" TEXT NOT NULL UNIQUE,
  "contentFingerprint" TEXT UNIQUE,
  "status" "AccountingDocStatus" NOT NULL DEFAULT 'RECEIVED',
  "reason" TEXT,
  "graphWebUrl" TEXT,
  "finalOneDriveItemId" TEXT,
  "finalOneDrivePath" TEXT,
  "processingAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastProcessedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Invoices
CREATE TABLE IF NOT EXISTS "AccountingInvoice" (
  "id" SERIAL PRIMARY KEY,
  "documentId" INTEGER NOT NULL UNIQUE REFERENCES "AccountingDocument"("id") ON DELETE CASCADE,
  "vendorId" INTEGER REFERENCES "AccountingVendor"("id") ON DELETE SET NULL,
  "invoiceNumber" TEXT,
  "invoiceDate" TIMESTAMP(3),
  "base" NUMERIC,
  "iva" NUMERIC,
  "total" NUMERIC,
  "currency" TEXT DEFAULT 'EUR',
  "vehiculoId" INTEGER REFERENCES "Vehiculo"("id") ON DELETE SET NULL,
  "matricula" TEXT,
  "category" "ExpenseCategory",
  "confidence" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique (vendorId, invoiceNumber) for level-2 dedupe
DO $$ BEGIN
  CREATE UNIQUE INDEX "AccountingInvoice_vendorId_invoiceNumber_key" ON "AccountingInvoice" ("vendorId", "invoiceNumber");
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- Vehicle Expenses (linked to invoices/documents)
CREATE TABLE IF NOT EXISTS "AccountingVehicleExpense" (
  "id" SERIAL PRIMARY KEY,
  "vehiculoId" INTEGER NOT NULL REFERENCES "Vehiculo"("id") ON DELETE CASCADE,
  "invoiceId" INTEGER UNIQUE REFERENCES "AccountingInvoice"("id") ON DELETE SET NULL,
  "category" "ExpenseCategory" NOT NULL,
  "description" TEXT,
  "base" NUMERIC,
  "iva" NUMERIC,
  "total" NUMERIC,
  "currency" TEXT DEFAULT 'EUR',
  "documentUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AccountingVehicleExpense_vehiculoId_category_idx"
  ON "AccountingVehicleExpense" ("vehiculoId", "category");


