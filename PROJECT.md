# Rental Car CRM — Desktop Application

Simple offline-first CRM for managing a car rental business on a Windows PC.  
**Not** a website. **Not** SaaS. Installed locally as a desktop application.

---

## 1. Goal

Build a lightweight desktop app to manage:

- Cars (fleet)
- Clients (customers)
- Contracts / rentals
- Payments
- Returns & status
- Basic reports

One PC install. Local database. No cloud required.

---

## 2. Recommended Tech Stack

| Layer | Choice | Why |
|--------|--------|-----|
| Desktop shell | **Electron** | Easy packaging as `.exe` installer for Windows |
| UI | **React + TypeScript** | Fast screens, forms, tables |
| Styling | **Tailwind CSS** | Simple, clean UI without heavy design work |
| Local DB | **SQLite** (via `better-sqlite3`) | File-based, no server, perfect for desktop |
| ORM / queries | **Prisma** or raw SQL | Simple schema + migrations |
| Packaging | **electron-builder** | Creates Windows installer (NSIS `.exe`) |
| Charts (optional) | **Recharts** | Dashboard stats |

### Alternative (lighter)

If you want a smaller app later: **Tauri + React + SQLite** (Rust shell, smaller `.exe`).

For v1, Electron is fine and faster to ship.

---

## 3. Core Features (v1)

### Cars
- Add / edit / delete car
- Fields: brand, model, plate, year, color, fuel, daily price, status
- Statuses: `available` | `rented` | `maintenance` | `out_of_service`
- Photo optional (stored locally)

### Clients
- Add / edit / delete client
- Fields: full name, phone, email, CIN/ID, address, notes
- Search by name / phone / CIN

### Contracts (Rentals)
- Create contract: client + car + start date + end date + price
- Auto-calc total (days × daily price) with optional discount
- Deposit / caution
- Statuses: `draft` | `active` | `completed` | `cancelled`
- Print / export PDF contract
- Mark car as rented when contract starts
- Mark car available when contract ends / return

### Payments
- Link payment to contract
- Amount, method (`cash` | `card` | `transfer`), date, note
- Track paid vs remaining

### Returns
- Return date, mileage, fuel level, damages note
- Extra fees if late / damage
- Close contract

### Dashboard
- Cars available / rented / maintenance
- Active contracts count
- Revenue this month
- Upcoming returns (next 7 days)

### Settings
- Company name, logo, phone, address (for PDF)
- Currency (MAD / EUR / USD)
- Default deposit rules
- Backup / restore database file

---

## 4. Out of Scope (v1)

- Multi-user online sync
- Mobile app
- Website / client portal
- Online payments
- GPS tracking
- Accounting software integration

---

## 5. Project Folder Structure

```text
rental-car-crm/
├── PROJECT.md                 # This file
├── README.md                  # How to install & run
├── package.json
├── electron-builder.yml       # Windows installer config
├── tsconfig.json
├── .gitignore
│
├── electron/                  # Desktop main process
│   ├── main.ts                # App window, menus, lifecycle
│   ├── preload.ts             # Safe bridge to renderer
│   └── ipc/                   # IPC handlers (DB, PDF, files)
│       ├── cars.ts
│       ├── clients.ts
│       ├── contracts.ts
│       ├── payments.ts
│       ├── reports.ts
│       └── settings.ts
│
├── src/                       # React UI (renderer)
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── AppShell.tsx
│   │   ├── ui/                # Buttons, inputs, modal, table
│   │   ├── cars/
│   │   ├── clients/
│   │   ├── contracts/
│   │   ├── payments/
│   │   └── dashboard/
│   │
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── CarsPage.tsx
│   │   ├── CarFormPage.tsx
│   │   ├── ClientsPage.tsx
│   │   ├── ClientFormPage.tsx
│   │   ├── ContractsPage.tsx
│   │   ├── ContractFormPage.tsx
│   │   ├── ContractDetailPage.tsx
│   │   ├── PaymentsPage.tsx
│   │   ├── ReportsPage.tsx
│   │   └── SettingsPage.tsx
│   │
│   ├── hooks/
│   ├── lib/
│   │   ├── api.ts             # Calls to Electron IPC
│   │   ├── format.ts          # Money, dates
│   │   └── validators.ts
│   └── types/
│       └── index.ts
│
├── database/
│   ├── schema.sql             # Tables definition
│   ├── migrations/            # Versioned schema changes
│   └── seed.sql               # Optional demo data
│
├── assets/
│   ├── icon.ico               # App icon (Windows)
│   ├── logo.png
│   └── templates/
│       └── contract.html      # PDF contract template
│
└── dist/                      # Build output (generated)
    ├── win-unpacked/
    └── RentalCarCRM Setup.exe
```

---

## 6. Database Schema (SQLite)

### `cars`
| Column | Type | Notes |
|--------|------|--------|
| id | INTEGER PK | |
| brand | TEXT | |
| model | TEXT | |
| plate_number | TEXT UNIQUE | |
| year | INTEGER | |
| color | TEXT | |
| fuel_type | TEXT | petrol / diesel / hybrid / electric |
| daily_price | REAL | |
| status | TEXT | available / rented / maintenance / out_of_service |
| mileage | INTEGER | |
| notes | TEXT | |
| photo_path | TEXT | local file path |
| created_at | TEXT | ISO datetime |
| updated_at | TEXT | |

### `clients`
| Column | Type | Notes |
|--------|------|--------|
| id | INTEGER PK | |
| full_name | TEXT | |
| phone | TEXT | |
| email | TEXT | |
| cin | TEXT | national ID |
| address | TEXT | |
| license_number | TEXT | driving license |
| notes | TEXT | |
| created_at | TEXT | |
| updated_at | TEXT | |

### `contracts`
| Column | Type | Notes |
|--------|------|--------|
| id | INTEGER PK | |
| contract_number | TEXT UNIQUE | e.g. CTR-2026-0001 |
| client_id | INTEGER FK → clients | |
| car_id | INTEGER FK → cars | |
| start_date | TEXT | |
| end_date | TEXT | |
| daily_price | REAL | snapshot at booking |
| total_days | INTEGER | |
| discount | REAL | default 0 |
| deposit | REAL | |
| total_amount | REAL | |
| status | TEXT | draft / active / completed / cancelled |
| notes | TEXT | |
| created_at | TEXT | |
| updated_at | TEXT | |

### `payments`
| Column | Type | Notes |
|--------|------|--------|
| id | INTEGER PK | |
| contract_id | INTEGER FK → contracts | |
| amount | REAL | |
| method | TEXT | cash / card / transfer |
| paid_at | TEXT | |
| note | TEXT | |
| created_at | TEXT | |

### `returns`
| Column | Type | Notes |
|--------|------|--------|
| id | INTEGER PK | |
| contract_id | INTEGER FK → contracts UNIQUE | |
| returned_at | TEXT | |
| mileage | INTEGER | |
| fuel_level | TEXT | |
| damages | TEXT | |
| extra_fees | REAL | |
| notes | TEXT | |

### `settings`
| Column | Type | Notes |
|--------|------|--------|
| key | TEXT PK | |
| value | TEXT | JSON or plain string |

---

## 7. App Screens (Navigation)

```text
Dashboard
Cars
  └─ New / Edit Car
Clients
  └─ New / Edit Client
Contracts
  ├─ New Contract
  └─ Contract Detail (payments + return)
Payments
Reports
Settings
```

Simple sidebar + content area. Desktop-first layout (min width ~1100px).

---

## 8. Business Rules

1. Cannot rent a car unless status is `available`.
2. Creating an **active** contract sets car status to `rented`.
3. Completing / returning a contract sets car status back to `available` (unless marked maintenance).
4. Contract total = `(total_days × daily_price) - discount + extra_fees`.
5. Remaining balance = `total_amount - sum(payments)`.
6. Contract number auto-generated: `CTR-YYYY-####`.
7. Soft delete optional later; v1 can hard-delete only unused records.

---

## 9. Desktop Install Flow

1. Develop with `npm run dev` (Electron + Vite).
2. Build with `npm run build` + `npm run dist`.
3. `electron-builder` produces:
   - `RentalCarCRM Setup.exe` (installer)
4. User installs on Windows PC.
5. App data stored locally, e.g.:
   - `%APPDATA%/RentalCarCRM/database.sqlite`
   - `%APPDATA%/RentalCarCRM/uploads/` (car photos)

Backup = copy the SQLite file + uploads folder.

---

## 10. Development Phases

### Phase 1 — Foundation
- Electron + React + SQLite setup
- Sidebar layout
- Cars CRUD
- Clients CRUD

### Phase 2 — Rentals
- Contracts create / list / detail
- Car status updates
- Payments

### Phase 3 — Close loop
- Return flow
- PDF contract export
- Dashboard stats

### Phase 4 — Polish
- Settings + company info
- Backup / restore
- Windows installer (`.exe`)
- Demo seed data

---

## 11. Scripts (planned)

```bash
npm install
npm run dev          # run desktop app in dev mode
npm run build        # compile TS + React
npm run dist         # create Windows installer
npm run db:migrate   # apply schema
npm run db:seed      # optional demo data
```

---

## 12. Non-Functional Requirements

- Offline by default
- Fast on normal office PCs
- French / Arabic / English labels possible later (start with one language)
- Data stays on the machine
- Simple UI: tables, forms, filters — no overdesigned dashboard

---

## 13. Suggested App Name

- **RentalCar CRM**
- Or brand it later (e.g. company name)

Windows product name example: `RentalCarCRM`

---

## 14. Next Step

When ready, we can scaffold the real project from this structure:

1. Init Electron + React + TypeScript
2. Create SQLite schema
3. Build Cars + Clients screens first
4. Then Contracts

Tell me which language you want for the UI (**French**, **Arabic**, or **English**) and we start coding Phase 1.
