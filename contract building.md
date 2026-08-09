# Contracts Module — Desktop App Build Guide

Step-by-step guide to build **Contrats de location** in your Electron app (React + IPC + SQLite), matching the Laravel web app.

**Needs first:** Cars, Customers, Reservations (and optionally Chauffeurs + Agency settings).

---

## What a contract is

A **legal rental document** linked to a reservation. It stores a **snapshot** of driver info, vehicle, dates, equipment, damages, and money — even if customer/car data changes later.

**Contract number:** auto `CTR-2026-0001` (year + sequence)

**Statuses:**

| Status | Key | Meaning |
|--------|-----|---------|
| Brouillon | `draft` | Being prepared |
| Actif | `active` | Car delivered to customer |
| Clôturé | `closed` | Car returned, contract finished |
| Annulé | `cancelled` | Cancelled |

**Lifecycle:**
```
draft → active (mark delivered) → closed (mark return)
         ↘ cancelled (any time except closed)
```

---

## Full contract model (SQLite)

One table `contracts`. JSON columns stored as TEXT.

### Links
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| number | TEXT UNIQUE | CTR-YYYY-0001 |
| reservation_id | INTEGER NULL | FK → reservations |
| customer_id | INTEGER NULL | FK → customers |
| car_id | INTEGER NULL | FK → cars |
| status | TEXT | draft, active, closed, cancelled |
| deleted_at | TEXT NULL | soft delete (archive) |

### Contract identity
| Column | Type |
|--------|------|
| contract_date | TEXT (date) |
| contract_city | TEXT |

### Driver 1 (required — legal snapshot)
| Column | Type |
|--------|------|
| driver1_name | TEXT NOT NULL |
| driver1_birth_date | TEXT |
| driver1_birth_place | TEXT |
| driver1_nationality | TEXT |
| driver1_address | TEXT |
| driver1_phone | TEXT |
| driver1_passport_number | TEXT |
| driver1_passport_issued_at | TEXT |
| driver1_passport_expires_at | TEXT |
| driver1_cin_number | TEXT |
| driver1_cin_issued_at | TEXT |
| driver1_cin_expires_at | TEXT |
| driver1_license_number | TEXT |
| driver1_license_issued_at | TEXT |
| driver1_license_expires_at | TEXT |

### Driver 2 (optional — same fields)
`driver2_name`, `driver2_birth_date`, … `driver2_license_expires_at` (all nullable)

### Vehicle snapshot (frozen on contract)
| Column | Type |
|--------|------|
| vehicle_brand | TEXT |
| vehicle_model | TEXT |
| vehicle_plate | TEXT |

### Departure / Return
| Column | Type |
|--------|------|
| departure_at | TEXT (datetime) |
| departure_place | TEXT |
| departure_mileage | INTEGER |
| departure_fuel_level | TEXT |
| return_at | TEXT (datetime) |
| return_place | TEXT |
| return_mileage | INTEGER |
| return_fuel_level | TEXT |
| billed_days | INTEGER default 0 |
| extension_until | TEXT (date) |
| extension_days | INTEGER default 0 |
| departure_notes | TEXT |
| return_notes | TEXT |

### Equipment & damages (JSON)
| Column | Type | Format |
|--------|------|--------|
| equipment | TEXT | JSON array: `["radio","jack",...]` |
| equipment_other | TEXT | free text |
| departure_damages | TEXT | JSON array (see below) |
| return_damages | TEXT | JSON array (see below) |
| include_damage_photos_in_pdf | INTEGER | 0/1, default 1 |

**Damage object:**
```json
{
  "part": "front",
  "type": "R",
  "note": "small scratch",
  "photo": "contracts/damages/departure/xxx.jpg"
}
```

**Damage types:** `R` = rayure, `B` = bosse, `E` = éclat, `C` = cassé

**Vehicle parts:** `front`, `rear`, `left_side`, `right_side`, `roof`, `windshield`, `wheels`, `interior`

**Equipment keys:** `radio`, `spare_wheel`, `jack`, `documents`, `vest`, `extinguisher`, `warning_triangle`, `baby_seat`

### Money (amounts in DH, TTC)
| Column | Type |
|--------|------|
| daily_rate | REAL default 0 |
| total_amount | REAL default 0 |
| deposit_amount | REAL default 0 |
| franchise_applies | INTEGER 0/1 |
| franchise_amount | REAL default 0 |
| extra_charges | REAL default 0 |
| extra_charges_note | TEXT |
| vat_applies | INTEGER default 1 |
| vat_rate | REAL default 20 |

### Lifecycle timestamps
| Column | Type |
|--------|------|
| delivered_at | TEXT |
| closed_at | TEXT |
| customer_signed_at | TEXT |
| agency_signed_at | TEXT |
| notes | TEXT |
| created_at | TEXT |
| updated_at | TEXT |

---

## Business rules (copy from web app)

1. **Create from reservation** — prefills customer, car, dates, rates, driver1 from customer snapshot, default equipment list, agency city.
2. **Auto number** — `CTR-{year}-{0001}` increment per year.
3. **Recalculate total** — `total_amount = billed_days × daily_rate` (when days/rate change).
4. **Mark delivered** — status → `active`, set `delivered_at`.
5. **Close contract** — status → `closed`, set return fields, update car mileage/fuel/notes.
6. **Cancel** — status → `cancelled`.
7. **Soft delete** — set `deleted_at` (archive, don't hard delete).
8. **One contract per reservation** — optional unique on reservation_id.
9. **Overdue** — active + return_at < now → show red in list.
10. **VAT breakdown** — for PDF: extract HT from TTC when vat_applies=true (default 20%).

**Fuel levels:** `vide`, `quart`, `moitie`, `trois_quarts`, `plein`

---

## Form sections (UI layout)

Build the edit page with these collapsible sections:

1. **Identité** — number, date, city, status, reservation, customer, car
2. **Conducteur 1** — all driver1 fields (+ pick from customer or chauffeur)
3. **Conducteur 2** — optional driver2 fields
4. **Véhicule & dates** — vehicle snapshot, departure/return datetime, mileage, billed_days, extension
5. **Équipements** — checkbox list + other text
6. **État départ** — fuel, notes, damage repeater + photos
7. **État retour** — same as departure
8. **Facturation** — VAT toggle, daily_rate, total, deposit, franchise, extra charges
9. **PDF** — include damage photos toggle
10. **Suivi** — delivered_at, closed_at, signatures, notes

---

## Build steps — copy prompts one by one

---

### Step 1 — Database

```
Add contracts table in Electron SQLite (sql.js) with ALL fields from CONTRACT-BUILD-GUIDE.md.

Include: links (reservation_id, customer_id, car_id), identity, driver1 + driver2 fields,
vehicle snapshot, departure/return, equipment JSON, departure_damages JSON, return_damages JSON,
money fields (daily_rate, total, deposit, franchise, extra_charges, vat_applies, vat_rate),
lifecycle timestamps, soft delete deleted_at.

Add TypeScript interface Contract.
Persist DB in userData.
```

---

### Step 2 — Contract service (main process)

```
Add contract service in Electron main process:

Functions:
- generateNumber() → CTR-2026-0001
- createFromReservation(reservationId) → prefills from reservation + customer + car
- getFleetStatus helpers: isOverdue(contract)
- markDelivered(id) → status active, delivered_at now
- closeContract(id, { return_at, return_mileage, return_fuel_level, return_notes, extra_charges }) → status closed, update car condition
- cancelContract(id) → status cancelled
- invoiceBreakdown(contract) → { total_ht, total_vat, total_ttc, lines[] }
- recalculateTotal → billed_days × daily_rate

Soft delete: set deleted_at, never hard delete.
Validate driver1_name required.
```

---

### Step 3 — IPC handlers

```
Expose contracts IPC:

- contracts:list(filters) — search number/customer/plate, filter status/car/customer/overdue/archived
- contracts:get(id)
- contracts:create(data)
- contracts:update(id, data)
- contracts:delete(id) — soft delete
- contracts:restore(id)
- contracts:createFromReservation(reservationId)
- contracts:markDelivered(id)
- contracts:close(id, returnData)
- contracts:cancel(id)
- contracts:generatePdf(id) → save/open PDF file

Response: { success, data?, error? }
```

---

### Step 4 — File storage for damage photos

```
Store contract damage photos in userData/storage/contracts/damages/departure/ and .../return/

IPC files:pickImage for damage repeater.
Delete photo file when removed from JSON or contract deleted.
```

---

### Step 5 — Contracts list page

```
Build /contracts React page:

Table columns:
- number (copyable)
- customer name + phone
- plate + brand/model
- departure datetime
- return datetime (red if overdue)
- billed days
- total DH
- status badge (Brouillon/Actif/Clôturé/Annulé)

Toolbar:
- search
- filters: status, car, customer, overdue toggle, archived toggle, date range
- buttons: "Nouveau contrat", "Depuis réservation"

Row actions: Edit, PDF, Cancel, Archive

French UI, dark table header.
```

---

### Step 6 — Create from reservation modal

```
Add "Depuis réservation" action on /contracts:

Modal: pick reservation (only those without contract yet, status pending/confirmed)
On confirm → contracts:createFromReservation → redirect to edit page

Show success toast with contract number.
```

---

### Step 7 — Contract form page (edit/create)

```
Build /contracts/new and /contracts/:id/edit with sections:

1. Identité: number (readonly auto), contract_date, contract_city, status, reservation picker (prefill on change), customer, car
2. Conducteur 1: name*, phone, birth info, CIN, passport, permis — button "Copier depuis client"
3. Conducteur 2: same fields optional
4. Véhicule: brand, model, plate, departure/return datetime+place, mileage, billed_days, extension
5. Équipements: checkboxes (radio, roue secours, cric, documents, gilet, extincteur, triangle, siège bébé)
6. État départ: fuel, notes, damages repeater (part, type, note, photo)
7. État retour: same
8. Facturation: TVA toggle+rate, daily_rate, total (auto calc), deposit, franchise, extra charges
9. Options PDF: include damage photos
10. Notes + signature dates

Auto recalc total when days or daily_rate changes.
Save via contracts:create / contracts:update.
French labels.
```

---

### Step 8 — Contract actions

```
On contract edit page add action buttons:

- "Marquer livré" (draft → active) — calls contracts:markDelivered
- "Clôturer" modal: return datetime, mileage, fuel, notes, extra charges — calls contracts:close
- "Annuler" with confirmation — calls contracts:cancel
- "Télécharger PDF" — calls contracts:generatePdf
- "Archiver" — soft delete

Hide actions based on status (e.g. can't close if already closed).
```

---

### Step 9 — PDF generation

```
Generate contract PDF in Electron main process (use pdfkit or puppeteer print).

Include:
- Agency header (name, address, ICE — from settings table or config)
- Contract number, date, city
- Driver 1 (+ driver 2 if filled)
- Vehicle plate, brand, model
- Departure/return dates, mileage, fuel
- Equipment checklist
- Damage table departure + return (optional photos if include_damage_photos_in_pdf)
- Invoice table: rental line, extra charges, VAT breakdown, deposit, franchise
- Signature blocks

Save to userData/storage/contracts/pdf/contrat-CTR-2026-0001.pdf
Open with system default PDF viewer.
```

---

### Step 10 — Polish

```
Add to contracts module:
- Stats on list: active contracts count, overdue count
- Link from reservation detail: "Créer contrat" if none exists
- Block creating 2 contracts for same reservation
- Export contracts list to Excel
- Dashboard widget: active contracts + overdue returns
```

---

## Prefill from reservation (logic)

When `createFromReservation(reservationId)`:

```
Copy from reservation:
  reservation_id, customer_id, car_id
  departure_at = pickup_date
  return_at = return_date
  billed_days, daily_rate, total_amount, deposit_amount

Copy from customer → driver1_* fields (driverSnapshot)

Copy from car:
  vehicle_brand, vehicle_model, vehicle_plate
  departure_mileage = car.mileage
  departure_fuel_level = car.fuel_level
  departure_notes = car.condition_notes

Defaults:
  status = draft
  contract_date = today
  contract_city = agency.city
  vat_applies = true, vat_rate = 20
  franchise_amount = agency.default_franchise_amount
  equipment = [radio, spare_wheel, jack, documents, vest, extinguisher, warning_triangle]
  include_damage_photos_in_pdf = true
  number = generateNumber()
```

---

## French labels reference

| Key | Label |
|-----|-------|
| draft | Brouillon |
| active | Actif |
| closed | Clôturé |
| cancelled | Annulé |
| contract_number | N° contrat |
| contract_date | Date du contrat |
| contract_departure_at | Date/heure départ |
| contract_return_at | Date/heure retour |
| contract_action_close | Clôturer le contrat |
| contract_from_reservation | Depuis une réservation |
| contract_download | Télécharger PDF |

---

---

## Suggested build order

```
1. Step 1 — Database
2. Step 2 — Service logic
3. Step 3 — IPC
4. Step 5 — List page (basic)
5. Step 6 — Create from reservation
6. Step 7 — Form (section by section)
7. Step 8 — Actions (deliver, close, cancel)
8. Step 4 — Damage photos
9. Step 9 — PDF
10. Step 10 — Polish
```

Start with Steps 1–3, then list + create from reservation. PDF can come last.
