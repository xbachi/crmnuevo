# CRM Seven Cars - Comprehensive Test Plan & Feature Inventory

## Repository Analysis

### Technology Stack
- **Frontend**: Next.js 15.5.2 + React 19.1.0 + TypeScript
- **Styling**: Tailwind CSS v4 with @tailwindcss/forms
- **Database**: PostgreSQL with Prisma ORM (client v6.16.1)
- **State Management**: React hooks (useState, useEffect) + local storage caching
- **UI Components**: Custom components with dnd-kit for drag-and-drop
- **PDF Generation**: jsPDF + svg2pdf.js + html2canvas
- **Charts**: Chart.js + react-chartjs-2
- **File Uploads**: Built-in Next.js API routes with uuid
- **External APIs**: Google Sheets (googleapis), Redis (optional)

### Current Test Infrastructure
- **None detected** - No existing test framework, runners, or configurations
- **Linting**: ESLint with Next.js config
- **Build**: Standard Next.js build pipeline
- **Scripts**: Database operations, Docker, migrations

## Core Business Entities & Models

### 1. Cliente (Customer)
**Database Model**: `Cliente`
**Primary Route**: `/clientes`
**API Endpoints**: `/api/clientes/*`

**Fields**:
- Basic: id, nombre, apellidos, email, telefono, dni (unique)
- Address: direccion, ciudad, provincia, codigoPostal
- Dates: fechaNacimiento, fechaRegistro, fechaPrimerContacto
- Preferences: vehiculosInteres, presupuestoMaximo, kilometrajeMaximo, añoMinimo
- Filters: combustiblePreferido, cambioPreferido, coloresDeseados, necesidadesEspeciales, formaPagoPreferida
- Tracking: comoLlego, estado, prioridad, proximoPaso, etiquetas, notasAdicionales, observaciones, activo

**Business Rules**:
- DNI must be unique if provided
- Email validation when provided
- Estado defaults to "nuevo"
- Prioridad defaults to "media"
- Address fields are mandatory ONLY in "Depósito de Venta" wizard
- Can have multiple notes (NotaCliente) and deals (Deal)

**API Operations**:
- GET /api/clientes - List with pagination/search
- POST /api/clientes - Create new cliente
- GET /api/clientes/[id] - Get specific cliente
- PUT /api/clientes/[id] - Update cliente
- DELETE /api/clientes/[id] - Soft delete (activo = false)
- GET /api/clientes/buscar?q=term - Search by name/email/phone/DNI
- GET/POST /api/clientes/[id]/notas - Manage cliente notes
- GET/POST/PUT/DELETE /api/clientes/[id]/recordatorios - Manage reminders

### 2. Vehículo (Vehicle)
**Database Model**: `Vehiculo`
**Primary Routes**: `/vehiculos`, `/cargar-vehiculo`
**API Endpoints**: `/api/vehiculos/*`

**Fields**:
- Core: id, referencia (unique), marca, modelo, matricula (unique), bastidor (unique), kms, tipo, estado, orden
- Dates: fechaMatriculacion, año
- Documents: itv, seguro, segundaLlave, documentacion, carpeta, master, hojasA
- Investor: esCocheInversor, inversorId, fechaCompra, precios, gastos, beneficioNeto, notasInversor, fotoInversor
- Deal: dealActivoId (when reserved/sold)

**Vehicle Types (tipo)**:
- "C" or "Compra" - Own vehicles (purchases)
- "R" or "Coche R" - Rental vehicles  
- "D" or "Deposito" or "Deposito Venta" - Consignment vehicles
- "I" or "Inversor" - Investor vehicles

**Vehicle States (estado)**:
- "disponible" - Available for sale
- "vendido" - Sold
- "reservado" - Reserved (has active deal)
- Kanban states: "sin estado"/"inicial", "documentacion", "mecanico", "fotos", "publicado"

**Reference Number Formatting**:
- Purchases: `#` + reference (e.g., #1010)
- Investors: `I-` + reference (e.g., I-9)  
- Deposits: `D-` + reference (e.g., D-5)
- Rentals: `R-` + reference (e.g., R-3)

**Business Rules**:
- Referencia, matricula, bastidor must be unique
- Only one active deposit per vehicle (tipo='D')
- Vehicle estado changes based on deal lifecycle
- Kanban order determines display sequence
- Visual indicators: different background colors by type (orange=investor, celeste=deposit, white=purchase/rental)

**API Operations**:
- GET /api/vehiculos - List with filters (tipo, estado, search)
- POST /api/vehiculos - Create new vehicle
- GET /api/vehiculos/[id] - Get specific vehicle
- PUT /api/vehiculos/[id] - Update vehicle
- DELETE /api/vehiculos/[id] - Delete vehicle
- GET /api/vehiculos/disponibles - Available vehicles for deals
- GET/PUT /api/vehiculos/kanban - Kanban board operations
- POST /api/vehiculos/sync-sheets - Google Sheets sync
- GET /api/vehiculos/stats - Statistics by type/state
- POST /api/vehiculos/cleanup-orphans - Remove orphaned vehicles

### 3. Deal (Transaction)
**Database Model**: `Deal`
**Primary Routes**: `/deals`, `/deals/crear`, `/deals/nuevo`
**API Endpoints**: `/api/deals/*`

**Fields**:
- Core: id, numero (unique), clienteId, vehiculoId, estado, resultado, motivo
- Financial: importeTotal, importeSena, formaPagoSena, restoAPagar, financiacion, entidadFinanciera
- Dates: fechaCreacion, fechaReservaDesde, fechaReservaExpira, fechaVentaFirmada, fechaFacturada, fechaEntrega
- Documents: contratoReserva, contratoVenta, factura, recibos
- Payments: pagosSena, pagosResto (JSON arrays)
- Tracking: observaciones, responsableComercial, logHistorial
- Name Change: cambioNombreSolicitado, documentacionRecibida, clienteAvisado, documentacionRetirada

**Deal States (estado)**:
- "nuevo" - Initial state
- "reservado" - Customer paid deposit, vehicle reserved
- "vendido" - Sale completed, contract signed
- "facturado" - Invoice generated, transaction complete

**Deal Number Format**:
- Reservations: `RES-YYYY-####` (e.g., RES-2025-0001)
- Sales: `CCV-YYYY-####` (e.g., CCV-2025-0001)  
- Invoices: `F-YYYY-####` (e.g., F-2025-0001)

**Business Rules**:
- Numero must be unique and auto-generated
- Vehicle becomes "reservado" when deal estado = "reservado"
- Vehicle becomes "vendido" when deal estado = "vendido"
- Reservation expiry releases vehicle automatically
- Documents generated in sequence: reserva → venta → factura
- Payment tracking in JSON format: [{monto, fecha, metodo}]
- Name change process has 4-step workflow

**API Operations**:
- GET /api/deals - List with pagination/filters
- POST /api/deals - Create new deal
- GET /api/deals/[id] - Get specific deal
- PUT /api/deals/[id] - Update deal
- DELETE /api/deals/[id] - Delete deal
- GET /api/deals/ultimas - Recent deals for dashboard
- GET/PUT /api/deals/[id]/venta-info - Sale information
- POST /api/deals/upload-file - Upload deal documents
- GET /api/deals/files/[fileId] - Download deal files

### 4. Depósito (Consignment)
**Database Model**: `depositos` (PostgreSQL table)
**Primary Routes**: `/depositos`, `/depositos/nuevo`
**API Endpoints**: `/api/depositos/*`

**Fields**:
- Core: id, cliente_id, vehiculo_id, estado, created_at, updated_at
- Financial: monto_recibir, dias_gestion, multa_retiro_anticipado, numero_cuenta
- Dates: fecha_inicio, fecha_fin (calculated from dias_gestion)
- Documents: contrato_deposito, contrato_compra (filenames)
- Legacy: precio_venta, comision_porcentaje, notas (being replaced by NotaDeposito)

**Deposit States (estado)**:
- "BORRADOR" - Draft state
- "ACTIVO" - Active deposit
- "VENDIDO" - Converted to sale
- "FINALIZADO" - Completed/closed

**Business Rules**:
- One active deposit per vehicle (tipo='D')
- fecha_fin = fecha_inicio + dias_gestion
- Estado changes: BORRADOR → ACTIVO (when contract generated) → VENDIDO → FINALIZADO
- Contract generation creates file and updates estado
- When marked as VENDIDO, enables "Generar Contrato de Compra"
- Vehicle must be tipo='D' and linked to deposit

**API Operations**:
- GET /api/depositos - List deposits with stats
- POST /api/depositos - Create new deposit
- GET /api/depositos/[id] - Get specific deposit
- PUT /api/depositos/[id] - Update deposit
- DELETE /api/depositos/[id] - Delete deposit
- GET /api/depositos/stats - Statistics for dashboard
- GET/POST/PUT/DELETE /api/depositos/[id]/notas - Manage deposit notes

### 5. NotaDeposito (Deposit Notes)
**Database Model**: `NotaDeposito`
**API Endpoints**: `/api/depositos/[id]/notas`

**Fields**:
- Core: id, depositoId, contenido, fecha, usuario
- Metadata: tipo, titulo, prioridad, completada, createdAt, updatedAt

**Business Rules**:
- Cumulative notes with timestamp and user tracking
- Support for edit and delete operations
- Types: "general", custom types allowed
- Priorities: "normal", "alta", "media", "baja"

### 6. Inversor (Investor)
**Database Model**: `Inversor`
**Primary Route**: `/inversores`
**API Endpoints**: `/api/inversores/*`

**Fields**:
- Core: id, nombre, email, telefono, activo
- Financial: capitalAportado, capitalInvertido
- Relations: vehiculos[] (Vehiculo with esCocheInversor=true)

**Business Rules**:
- Can have multiple vehicles assigned
- Vehicle tipo becomes "I" when assigned to investor
- Capital tracking for ROI calculations
- File uploads for investor documentation

**API Operations**:
- GET /api/inversores - List investors
- POST /api/inversores - Create investor
- GET /api/inversores/[id] - Get specific investor
- PUT /api/inversores/[id] - Update investor
- GET /api/inversores/[id]/vehiculos - Investor vehicles
- POST /api/inversores/[id]/vehiculos/asignar - Assign vehicle
- GET /api/inversores/[id]/metrics - Performance metrics
- POST /api/inversores/files/upload - Upload investor files
- GET /api/inversores/files/[id]/download - Download files

## Frontend Pages & Routes

### Authentication & Dashboard
- `/` - Main dashboard with metrics, reminders, recent operations
- No explicit authentication system detected (public access)

### Cliente Management
- `/clientes` - Cliente list with search/filters/pagination
- `/clientes/crear` - Create new cliente (full form)
- `/clientes/[id]` - Cliente detail view with notes, deals, reminders
- `/clientes/dashboard` - Cliente analytics dashboard

### Vehicle Management  
- `/vehiculos` - Vehicle list with filters by tipo, search
- `/cargar-vehiculo` - Create new vehicle form
- `/kanban` - Kanban board for vehicle workflow (estados)

### Deal Management
- `/deals` - Deal list with search/filters
- `/deals/crear` - Create deal wizard (cliente + vehicle selection)
- `/deals/nuevo` - Alternative deal creation
- `/deals/[id]` - Deal detail with documents, payments, notes

### Deposit Management
- `/depositos` - Deposit list with estados
- `/depositos/nuevo` - Create deposit wizard (cliente + vehicle + financial)
- `/depositos/[id]` - Deposit detail with contracts, notes, actions

### Investor Management
- `/inversores` - Investor list
- `/dashboard-inversores` - Investor analytics
- `/inversores/[id]` - Investor profile with vehicles, files

### Utilities
- `/documentacion` - Document manager
- `/importar-csv` - CSV import tool
- `/test-pdf` - PDF generation testing
- `/test-sheets` - Google Sheets integration testing

## API Endpoints Inventory

### Cliente APIs
- `GET /api/clientes` - List/search clientes
- `POST /api/clientes` - Create cliente  
- `GET /api/clientes/[id]` - Get cliente details
- `PUT /api/clientes/[id]` - Update cliente
- `DELETE /api/clientes/[id]` - Delete cliente
- `GET /api/clientes/buscar?q=term` - Search functionality
- `GET /api/clientes/[id]/notas` - Get cliente notes
- `POST /api/clientes/[id]/notas` - Add note
- `GET /api/clientes/[id]/recordatorios` - Get reminders
- `POST /api/clientes/[id]/recordatorios` - Add reminder
- `PUT/DELETE /api/clientes/[id]/recordatorios/[reminderId]` - Manage reminders

### Vehicle APIs
- `GET /api/vehiculos` - List vehicles with filters
- `POST /api/vehiculos` - Create vehicle
- `GET /api/vehiculos/[id]` - Get vehicle details  
- `PUT /api/vehiculos/[id]` - Update vehicle
- `DELETE /api/vehiculos/[id]` - Delete vehicle
- `GET /api/vehiculos/disponibles` - Available vehicles
- `GET /api/vehiculos/kanban` - Kanban data
- `PUT /api/vehiculos/kanban` - Update kanban positions
- `POST /api/vehiculos/sync-sheets` - Google Sheets sync
- `GET /api/vehiculos/stats` - Vehicle statistics
- `POST /api/vehiculos/cleanup-orphans` - Clean orphaned records
- `POST /api/vehiculos/import-csv` - CSV import

### Deal APIs
- `GET /api/deals` - List deals
- `POST /api/deals` - Create deal
- `GET /api/deals/[id]` - Get deal details
- `PUT /api/deals/[id]` - Update deal
- `DELETE /api/deals/[id]` - Delete deal
- `GET /api/deals/ultimas` - Recent deals
- `GET /api/deals/[id]/venta-info` - Sale information
- `PUT /api/deals/[id]/venta-info` - Update sale info
- `POST /api/deals/upload-file` - Upload documents
- `GET /api/deals/files/[fileId]` - Download files

### Deposit APIs
- `GET /api/depositos` - List deposits
- `POST /api/depositos` - Create deposit
- `GET /api/depositos/[id]` - Get deposit details
- `PUT /api/depositos/[id]` - Update deposit
- `DELETE /api/depositos/[id]` - Delete deposit
- `GET /api/depositos/stats` - Deposit statistics
- `GET /api/depositos/[id]/notas` - Get deposit notes
- `POST /api/depositos/[id]/notas` - Add deposit note
- `PUT /api/depositos/[id]/notas` - Edit deposit note
- `DELETE /api/depositos/[id]/notas` - Delete deposit note

### Investor APIs
- `GET /api/inversores` - List investors
- `POST /api/inversores` - Create investor
- `GET /api/inversores/[id]` - Get investor details
- `PUT /api/inversores/[id]` - Update investor
- `GET /api/inversores/[id]/vehiculos` - Investor vehicles
- `POST /api/inversores/[id]/vehiculos/asignar` - Assign vehicle
- `GET /api/inversores/[id]/metrics` - Performance metrics
- `POST /api/inversores/files/upload` - Upload files
- `GET /api/inversores/files/[id]/download` - Download files

### Document APIs
- `POST /api/contratos/venta` - Generate sale contract
- `GET /api/documentacion/files` - List documents
- `POST /api/documentacion/upload-file` - Upload document
- `GET /api/documentacion/files/[fileId]` - Download document
- `GET /api/documentacion/metadata` - Document metadata

### Utility APIs
- `GET /api/recordatorios` - Global reminders
- `POST /api/recordatorios` - Create reminder
- `PUT/DELETE /api/recordatorios/[id]` - Manage reminders
- `DELETE /api/recordatorios/eliminar-cambio-nombre/[dealId]` - Remove name change reminder
- `GET /api/ventas` - Sales analytics
- `POST /api/clear-cache` - Clear system cache

## Key Business Rules & Workflows

### 1. Vehicle Type Management
- Purchase vehicles: tipo='C', reference format #XXXX
- Investor vehicles: tipo='I', reference format I-XXXX, orange background
- Deposit vehicles: tipo='D', reference format D-XXXX, celeste background  
- Rental vehicles: tipo='R', reference format R-XXXX

### 2. Deposit Workflow
1. Create cliente (with mandatory address in deposit wizard)
2. Create/select vehicle with tipo='D'
3. Create deposit with financial terms (monto_recibir, dias_gestion, etc.)
4. Generate deposit contract → estado becomes 'ACTIVO'
5. Mark as 'VENDIDO' → enables sale contract generation
6. Generate sale contract 
7. Mark as 'FINALIZADO'

### 3. Deal Workflow  
1. Create deal with cliente + vehicle
2. Reserve vehicle → estado='reservado', vehicle estado='reservado'
3. Generate reservation contract (RES-YYYY-####)
4. Convert to sale → estado='vendido', vehicle estado='vendido'
5. Generate sale contract (CCV-YYYY-####)
6. Generate invoice → estado='facturado' (F-YYYY-####)

### 4. Document Generation
- Uses jsPDF + svg2pdf.js for PDF creation
- Templates with dynamic field replacement (*CLIENTE*, *VEHICULO*, etc.)
- Files stored in public/uploads/documentacion/
- Unique filenames with UUID
- Download endpoints return files with proper headers

### 5. Number Sequences
- Auto-generated unique numbers per type per year
- Format: PREFIX-YYYY-#### (zero-padded to 4 digits)
- Sequences: RES (reservations), CCV (sales), F (invoices)

### 6. State Transitions
- Vehicle: disponible → reservado → vendido
- Deal: nuevo → reservado → vendido → facturado
- Deposit: BORRADOR → ACTIVO → VENDIDO → FINALIZADO
- Automatic state sync between related entities

## Test Coverage Requirements

### Unit Tests (80% coverage target)
1. **Utility Functions**
   - `src/lib/utils.ts` - formatCurrency, formatDate, formatVehicleReference
   - `src/lib/contractGenerator.ts` - PDF generation logic
   - Number formatting and validation functions
   - Date calculations (deposit expiry, deal expiry)

2. **Business Logic**
   - Vehicle reference formatting by type
   - State transition validation
   - Financial calculations (deposit terms, deal totals)
   - Document filename generation

3. **Data Validation**
   - Form validation schemas
   - API request/response validation
   - Database constraint enforcement

### Integration Tests (API + Database)
1. **CRUD Operations**
   - Cliente: create, read, update, delete, search
   - Vehicle: create, read, update, delete, filters, kanban
   - Deal: create, read, update, delete, state changes
   - Deposit: create, read, update, delete, contract generation
   - Investor: create, read, update, assign vehicles

2. **Business Rules**
   - Unique constraints (DNI, matricula, bastidor, numero)
   - Foreign key relationships
   - State transition logic
   - One active deposit per vehicle rule

3. **Document Operations**
   - PDF generation and storage
   - File upload/download
   - Document linking to entities

4. **Number Sequences**
   - Auto-generation of unique numbers
   - Year-based sequences
   - Collision prevention

### E2E Tests (User Journeys)
1. **Core Workflows**
   - Complete deposit workflow: create → contract → sell → finalize
   - Complete deal workflow: create → reserve → sell → invoice
   - Cliente management: create → edit → add notes → reminders
   - Vehicle management: create → kanban → assign → sell

2. **Form Validation**
   - Required field validation
   - Format validation (email, phone, DNI)
   - Unique constraint handling

3. **Navigation & UI**
   - All pages load without errors
   - Search and filter functionality
   - Pagination and sorting
   - Modal dialogs and confirmations

4. **Document Generation**
   - Contract generation buttons
   - PDF download functionality
   - File upload/management

5. **Error Handling**
   - Network errors
   - Validation errors
   - Permission errors
   - Database constraint violations

## Test Implementation Plan

### Phase 1: Setup & Infrastructure
1. Install test dependencies (Jest, Playwright, @testing-library)
2. Configure test environments and databases
3. Create test data factories and fixtures
4. Setup CI/CD pipeline integration

### Phase 2: Unit Tests
1. Utility function tests
2. Component unit tests
3. Business logic validation tests
4. Mock external dependencies

### Phase 3: Integration Tests
1. API endpoint tests with real database
2. Database operation tests
3. File upload/download tests
4. External service integration tests

### Phase 4: E2E Tests
1. Critical user journey tests
2. Form validation and error handling
3. Navigation and UI interaction tests
4. Cross-browser compatibility tests

### Phase 5: Performance & Accessibility
1. Page load performance tests
2. API response time tests  
3. Accessibility compliance tests
4. Mobile responsiveness tests

## Success Criteria

1. **Coverage**: 80% code coverage across unit and integration tests
2. **Reliability**: All E2E tests pass consistently in CI/CD
3. **Performance**: Page loads under 2s, API responses under 500ms
4. **Quality**: Zero console errors on critical pages
5. **Accessibility**: WCAG 2.1 AA compliance on core workflows
6. **Maintainability**: Tests run in under 10 minutes total
7. **Documentation**: Complete test documentation and runbooks

This comprehensive test plan ensures all critical business functionality is validated automatically, preventing regressions and maintaining system reliability as the CRM evolves.
