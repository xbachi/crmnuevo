import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

// Cargar variables de entorno manualmente
const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          process.env[key] = value.replace(/"/g, '');
        }
      });
    }
  } catch (error) {
    console.error('Error cargando .env.local:', error);
  }
}

loadEnvFile();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dealId = parseInt(id, 10);
    if (isNaN(dealId)) {
      return NextResponse.json({ error: 'ID de deal inválido' }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          "importeTotal" as "montoVenta",
          "formaPagoSena" as "formaPago",
          "entidadFinanciera",
          "garantia",
          "montoContado",
          "montoFinanciado"
        FROM "Deal"
        WHERE id = $1
      `, [dealId]);

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Deal no encontrado' }, { status: 404 });
      }

      return NextResponse.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching venta info:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dealId = parseInt(id, 10);
    if (isNaN(dealId)) {
      return NextResponse.json({ error: 'ID de deal inválido' }, { status: 400 });
    }

    const body = await request.json();
    const { 
      montoVenta, 
      formaPago, 
      montoContado, 
      montoFinanciado, 
      garantia, 
      entidadFinanciera 
    } = body;

    // Validaciones
    if (!montoVenta || montoVenta <= 0) {
      return NextResponse.json({ error: 'El monto de venta debe ser mayor a 0' }, { status: 400 });
    }

    if (formaPago === 'mixto') {
      if (!montoContado || !montoFinanciado || montoContado <= 0 || montoFinanciado <= 0) {
        return NextResponse.json({ error: 'Para pago mixto, ambos montos deben ser mayores a 0' }, { status: 400 });
      }
      if (Math.abs((montoContado + montoFinanciado) - montoVenta) > 0.01) {
        return NextResponse.json({ error: 'La suma de contado + financiado debe igualar el monto total' }, { status: 400 });
      }
    }

    if ((formaPago === 'financiado' || formaPago === 'mixto') && !entidadFinanciera?.trim()) {
      return NextResponse.json({ error: 'Debe especificar la entidad financiera' }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      const result = await client.query(`
        UPDATE "Deal"
        SET 
          "importeTotal" = $1,
          "formaPagoSena" = $2,
          "entidadFinanciera" = $3,
          "garantia" = $4,
          "montoContado" = $5,
          "montoFinanciado" = $6,
          "updatedAt" = NOW()
        WHERE id = $7
        RETURNING *
      `, [
        montoVenta,
        formaPago,
        entidadFinanciera || null,
        garantia || 'standard',
        montoContado || null,
        montoFinanciado || null,
        dealId
      ]);

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Deal no encontrado' }, { status: 404 });
      }

      return NextResponse.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating venta info:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
