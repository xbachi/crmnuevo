const fs = require('fs');
const path = require('path');

// Crear directorio data si no existe
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Datos de clientes de prueba
const sampleClients = [
  {
    id: 1,
    nombre: "María",
    apellidos: "García López",
    telefono: "666123456",
    email: "maria.garcia@email.com",
    whatsapp: "666123456",
    comoLlego: "Google",
    fechaPrimerContacto: "2024-01-15",
    estado: "en_seguimiento",
    prioridad: "alta",
    proximoPaso: "Enviar presupuesto de financiación",
    etiquetas: ["compra_inmediata", "financiacion"],
    intereses: {
      vehiculoPrincipal: "Renault Clio",
      modelosAlternativos: ["Peugeot 208", "Volkswagen Polo"],
      precioMaximo: 15000,
      kilometrajeMaximo: 50000,
      añoMinimo: 2020,
      combustiblePreferido: "gasolina",
      cambioPreferido: "manual",
      coloresDeseados: ["blanco", "gris"],
      necesidadesEspeciales: ["isofix", "maletero_grande"],
      formaPagoPreferida: "financiacion"
    },
    createdAt: "2024-01-15T10:30:00.000Z",
    updatedAt: "2024-01-15T10:30:00.000Z"
  },
  {
    id: 2,
    nombre: "Carlos",
    apellidos: "Martín Ruiz",
    telefono: "666789012",
    email: "carlos.martin@email.com",
    whatsapp: "666789012",
    comoLlego: "Recomendado",
    fechaPrimerContacto: "2024-01-20",
    estado: "cita_agendada",
    prioridad: "media",
    proximoPaso: "Prueba de coche programada para el viernes",
    etiquetas: ["familia", "diesel"],
    intereses: {
      vehiculoPrincipal: "Audi A3",
      modelosAlternativos: ["BMW Serie 1", "Mercedes Clase A"],
      precioMaximo: 25000,
      kilometrajeMaximo: 80000,
      añoMinimo: 2018,
      combustiblePreferido: "diesel",
      cambioPreferido: "automatico",
      coloresDeseados: ["negro", "azul"],
      necesidadesEspeciales: ["gps", "climatizador"],
      formaPagoPreferida: "contado"
    },
    createdAt: "2024-01-20T14:15:00.000Z",
    updatedAt: "2024-01-20T14:15:00.000Z"
  },
  {
    id: 3,
    nombre: "Ana",
    apellidos: "Fernández Silva",
    telefono: "666345678",
    email: "ana.fernandez@email.com",
    whatsapp: "666345678",
    comoLlego: "Visita directa",
    fechaPrimerContacto: "2024-01-25",
    estado: "nuevo",
    prioridad: "baja",
    proximoPaso: "Enviar catálogo de vehículos híbridos",
    etiquetas: ["ecologico", "ciudad"],
    intereses: {
      vehiculoPrincipal: "Toyota Prius",
      modelosAlternativos: ["Honda Civic Híbrido", "Hyundai Ioniq"],
      precioMaximo: 20000,
      kilometrajeMaximo: 60000,
      añoMinimo: 2019,
      combustiblePreferido: "hibrido",
      cambioPreferido: "automatico",
      coloresDeseados: ["blanco", "plateado"],
      necesidadesEspeciales: ["bajo_consumo", "silencioso"],
      formaPagoPreferida: "financiacion"
    },
    createdAt: "2024-01-25T09:45:00.000Z",
    updatedAt: "2024-01-25T09:45:00.000Z"
  },
  {
    id: 4,
    nombre: "Roberto",
    apellidos: "Jiménez Torres",
    telefono: "666901234",
    email: "roberto.jimenez@email.com",
    whatsapp: "666901234",
    comoLlego: "Redes sociales",
    fechaPrimerContacto: "2024-01-28",
    estado: "en_seguimiento",
    prioridad: "alta",
    proximoPaso: "Llamar para confirmar disponibilidad del vehículo",
    etiquetas: ["urgente", "deportivo"],
    intereses: {
      vehiculoPrincipal: "BMW Serie 3",
      modelosAlternativos: ["Audi A4", "Mercedes Clase C"],
      precioMaximo: 35000,
      kilometrajeMaximo: 100000,
      añoMinimo: 2017,
      combustiblePreferido: "gasolina",
      cambioPreferido: "manual",
      coloresDeseados: ["rojo", "negro"],
      necesidadesEspeciales: ["deportivo", "potencia"],
      formaPagoPreferida: "entrega_usado"
    },
    createdAt: "2024-01-28T16:20:00.000Z",
    updatedAt: "2024-01-28T16:20:00.000Z"
  },
  {
    id: 5,
    nombre: "Laura",
    apellidos: "Sánchez Moreno",
    telefono: "666567890",
    email: "laura.sanchez@email.com",
    whatsapp: "666567890",
    comoLlego: "Google",
    fechaPrimerContacto: "2024-02-01",
    estado: "cerrado",
    prioridad: "media",
    proximoPaso: "Entrega programada para el lunes",
    etiquetas: ["vendido", "satisfecha"],
    intereses: {
      vehiculoPrincipal: "Volkswagen Golf",
      modelosAlternativos: ["Seat León", "Skoda Octavia"],
      precioMaximo: 18000,
      kilometrajeMaximo: 70000,
      añoMinimo: 2019,
      combustiblePreferido: "diesel",
      cambioPreferido: "manual",
      coloresDeseados: ["azul", "gris"],
      necesidadesEspeciales: ["fiabilidad", "mantenimiento_barato"],
      formaPagoPreferida: "financiacion"
    },
    createdAt: "2024-02-01T11:30:00.000Z",
    updatedAt: "2024-02-01T11:30:00.000Z"
  }
];

// Escribir archivo de clientes
const clientesPath = path.join(dataDir, 'clientes.json');
fs.writeFileSync(clientesPath, JSON.stringify(sampleClients, null, 2));

// Crear algunas notas de ejemplo
const sampleNotas = [
  {
    id: 1,
    clienteId: 1,
    fecha: "2024-01-15T10:30:00.000Z",
    tipo: "llamada",
    titulo: "Primera consulta",
    contenido: "Cliente interesada en un Clio. Busca financiación. Muy decidida a comprar.",
    recordatorio: "Enviar presupuesto de financiación mañana",
    createdAt: "2024-01-15T10:30:00.000Z"
  },
  {
    id: 2,
    clienteId: 1,
    fecha: "2024-01-16T14:20:00.000Z",
    tipo: "presupuesto",
    titulo: "Presupuesto enviado",
    contenido: "Enviado presupuesto de financiación para Clio 2021. Esperando respuesta.",
    recordatorio: "Llamar en 2 días si no responde",
    createdAt: "2024-01-16T14:20:00.000Z"
  },
  {
    id: 3,
    clienteId: 2,
    fecha: "2024-01-20T14:15:00.000Z",
    tipo: "visita",
    titulo: "Visita al concesionario",
    contenido: "Cliente visitó el concesionario. Interesado en Audi A3. Programó prueba para el viernes.",
    recordatorio: "Preparar coche para prueba del viernes",
    createdAt: "2024-01-20T14:15:00.000Z"
  },
  {
    id: 4,
    clienteId: 3,
    fecha: "2024-01-25T09:45:00.000Z",
    tipo: "mensaje",
    titulo: "Consulta por WhatsApp",
    contenido: "Preguntó por vehículos híbridos. Enviado catálogo.",
    recordatorio: "Seguimiento en una semana",
    createdAt: "2024-01-25T09:45:00.000Z"
  },
  {
    id: 5,
    clienteId: 4,
    fecha: "2024-01-28T16:20:00.000Z",
    tipo: "llamada",
    titulo: "Consulta urgente",
    contenido: "Cliente busca BMW Serie 3 urgente. Tiene vehículo para entrega. Alta prioridad.",
    recordatorio: "Verificar disponibilidad inmediatamente",
    createdAt: "2024-01-28T16:20:00.000Z"
  },
  {
    id: 6,
    clienteId: 5,
    fecha: "2024-02-01T11:30:00.000Z",
    tipo: "presupuesto",
    titulo: "Venta cerrada",
    contenido: "Cliente aceptó presupuesto. Venta cerrada. Entrega programada para el lunes.",
    recordatorio: "Preparar documentación para entrega",
    createdAt: "2024-02-01T11:30:00.000Z"
  }
];

// Escribir archivo de notas
const notasPath = path.join(dataDir, 'notas_clientes.json');
fs.writeFileSync(notasPath, JSON.stringify(sampleNotas, null, 2));

console.log('✅ Clientes de prueba creados exitosamente');
console.log(`📁 Archivo de clientes: ${clientesPath}`);
console.log(`📁 Archivo de notas: ${notasPath}`);
console.log(`👥 Total de clientes: ${sampleClients.length}`);
console.log(`📝 Total de notas: ${sampleNotas.length}`);

