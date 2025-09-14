# Estados Consistentes - CRM Seven

## 📋 Estados de DEALS
**Estados válidos:** `nuevo`, `reservado`, `vendido`, `facturado`

### Descripción:
- **`nuevo`**: Deal recién creado, sin documentos
- **`reservado`**: Deal con contrato de reserva generado
- **`vendido`**: Deal con contrato de venta generado
- **`facturado`**: Deal con factura generada

### Uso en el código:
```typescript
// ✅ CORRECTO
const estados: ('nuevo' | 'reservado' | 'vendido' | 'facturado')[] = ['nuevo', 'reservado', 'vendido', 'facturado']

// ❌ INCORRECTO - NO USAR
// 'reserva', 'venta', 'factura', 'cerrado'
```

---

## 🚗 Estados de VEHÍCULOS
**Estados válidos:** `disponible`, `reservado`, `vendido`

### Descripción:
- **`disponible`**: Vehículo en stock, disponible para venta
- **`reservado`**: Vehículo reservado por un deal activo
- **`vendido`**: Vehículo vendido, no disponible

### Uso en el código:
```typescript
// ✅ CORRECTO
const estados: ('disponible' | 'reservado' | 'vendido')[] = ['disponible', 'reservado', 'vendido']

// ❌ INCORRECTO - NO USAR
// 'VENDIDO' (mayúsculas), 'vendida', 'activo'
```

---

## 👥 Estados de CLIENTES
**Estados válidos:** `nuevo`, `en_seguimiento`, `cita_agendada`, `cerrado`, `descartado`

### Descripción:
- **`nuevo`**: Cliente recién registrado
- **`en_seguimiento`**: Cliente en proceso de seguimiento
- **`cita_agendada`**: Cliente con cita programada
- **`cerrado`**: Cliente que cerró un deal exitosamente
- **`descartado`**: Cliente descartado o no viable

### Uso en el código:
```typescript
// ✅ CORRECTO
const estados: ('nuevo' | 'en_seguimiento' | 'cita_agendada' | 'cerrado' | 'descartado')[] = [
  'nuevo', 'en_seguimiento', 'cita_agendada', 'cerrado', 'descartado'
]
```

---

## 🎨 Colores de Estados

### DEALS:
- `nuevo`: `bg-blue-100 text-blue-800`
- `reservado`: `bg-yellow-100 text-yellow-800`
- `vendido`: `bg-green-100 text-green-800`
- `facturado`: `bg-purple-100 text-purple-800`

### VEHÍCULOS:
- `disponible`: `bg-green-100 text-green-800`
- `reservado`: `bg-yellow-100 text-yellow-800`
- `vendido`: `bg-red-100 text-red-800`

### CLIENTES:
- `nuevo`: `bg-blue-100 text-blue-800`
- `en_seguimiento`: `bg-yellow-100 text-yellow-800`
- `cita_agendada`: `bg-purple-100 text-purple-800`
- `cerrado`: `bg-green-100 text-green-800`
- `descartado`: `bg-red-100 text-red-800`

---

## 🔧 Funciones de Actualización

### updateDeal() - Estados compatibles:
```typescript
switch (newEstado) {
  case 'reserva':
  case 'reservado': // ✅ Estado correcto
    vehiculoEstado = 'reservado'
    break
  case 'venta':
  case 'vendido': // ✅ Estado correcto
    vehiculoEstado = 'vendido'
    break
  case 'factura':
  case 'facturado': // ✅ Estado correcto
    vehiculoEstado = 'vendido'
    break
}
```

---

## 📝 Schema Prisma - Defaults

```prisma
model Deal {
  estado String @default("nuevo") // ✅ Correcto
}

model Vehiculo {
  estado String @default("disponible") // ✅ Correcto
}

model Cliente {
  estado String? @default("nuevo") // ✅ Correcto
}
```

---

## ⚠️ Reglas Importantes

1. **Siempre usar los estados exactos** definidos arriba
2. **No mezclar mayúsculas/minúsculas** (ej: `VENDIDO` vs `vendido`)
3. **No crear nuevos estados** sin actualizar esta documentación
4. **Verificar consistencia** entre frontend y base de datos
5. **Usar los colores definidos** para mantener UI consistente

---

## 🚨 Estados que NO se deben usar

### DEALS (obsoletos):
- `reserva` → usar `reservado`
- `venta` → usar `vendido`
- `factura` → usar `facturado`
- `cerrado` → usar `vendido` o `facturado`

### VEHÍCULOS (obsoletos):
- `VENDIDO` → usar `vendido`
- `vendida` → usar `vendido`
- `activo` → usar `disponible`

---

**Última actualización:** $(date)
**Mantenido por:** Equipo de desarrollo CRM Seven
