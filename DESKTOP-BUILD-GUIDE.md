# Desktop App Build Guide

**Stack:** React + TypeScript + Electron IPC + SQLite (sql.js) — offline

**Car status (only 3):**
- **Disponible** — in catalog, not rented today
- **Louée** — rented today (active reservation)
- **Hors service** — out of catalog (`is_available = false`)

---

## Roadmap

1. Cars
2. Customers
3. Reservations
4. Payments
5. Contracts
6. Expenses
7. Chauffeurs
8. Dashboard

---

# Cars — Simple prompts

Copy one prompt at a time into Cursor.

---

### Prompt 1 — Database

```
Add SQLite tables for cars and car_images in my Electron app (main process, sql.js).

cars: id, name, brand, model, year, color, plate_number (unique), category, price_per_day, transmission, seats, fuel, bags, badge, is_available, mileage, fuel_level, condition_notes, 5 document paths + expiry dates, created_at, updated_at.

car_images: id, car_id, path, position.

Save DB in userData. Add TypeScript types.
```

---

### Prompt 2 — Backend (IPC)

```
Add car CRUD in Electron main process:

- list cars (search + filters)
- get one car with photos
- create / update / delete car
- stats: total, disponible, louée, hors service

Status rules:
- hors service = is_available false
- louée = available + rented today
- disponible = available + not rented today

Validate plate unique, save photos in car_images table.
Expose via IPC to React.
```

---

### Prompt 3 — Files (photos + PDFs)

```
Add file upload for cars in Electron:
- pick and save car photos (jpg/png)
- pick and save PDF documents (carte grise, assurance, etc.)
- show preview in UI
- delete file when car/photo removed

Store in userData/storage/cars/
```

---

### Prompt 4 — Cars list page

```
Build /cars page in React:
- table with photo, name, plate, status badge (Disponible/Louée/Hors service), price DH
- 4 stat cards on top
- search bar + filter by status and category
- button Add car + edit button per row
- French labels, clean admin style
```

---

### Prompt 5 — Add / Edit car form

```
Build car form page (create + edit):
- fields: name, brand, model, year, color, plate, category, price/day, transmission, seats, fuel, bags, available toggle
- photo gallery (add/remove)
- documents section: 5 PDFs + expiry dates
- save button → back to /cars
French UI.
```

---

### Prompt 6 — Delete + Export

```
Add to cars module:
- delete car with confirmation
- export cars list to Excel (.xlsx)
Status in export: Disponible, Louée, Hors service.
```

---

### Prompt 7 — Connect reservations (later)

```
When reservations exist, update car status:
- Louée = car has reservation today (pending or confirmed)
- show return date on list when Louée
```

---

## Field values (copy reference)

| Field | Values |
|-------|--------|
| category | economique, compacte, suv, 4x4, monospace |
| transmission | manuelle, automatique |
| fuel | Essence, Diesel, Hybride, Électrique |

## Web app reference (Laravel)

- `app/Models/Car.php`
- `app/Filament/Resources/Cars/`

---

# Customers — Simple prompts

---

### Prompt 1 — Database + Backend

```
Add customers module in Electron (SQLite + IPC):

Table customers: id, name, phone, email, birth_date, birth_place, nationality, address,
CIN number + PDF path + issue/expiry dates,
passport number + PDF path + issue/expiry dates,
driver license number + PDF path + issue/expiry dates,
created_at, updated_at.

CRUD: list (search name/phone/email/CIN), get, create, update, delete.
Store ID PDFs in userData/storage/customers/.
French UI.
```

---

### Prompt 2 — UI

```
Build /customers page:
- table: name, phone, email, CIN, license expiry
- search + add/edit form with all customer fields
- upload 3 documents (CIN, passport, permis) as PDF
- delete with confirmation
```

---

# Reservations — Simple prompts

**Status:** pending, confirmed, cancelled, completed  
**Payment:** unpaid, partial, paid

---

### Prompt 1 — Database + Backend

```
Add reservations module (needs cars + customers):

Table: id, reference (auto), car_id, customer_id, chauffeur_id (optional),
pickup_date, return_date (datetime), delivery_location, message,
days, daily_rate, total_amount, deposit_amount, deposit_status,
status, payment_status, created_at, updated_at.

Auto-calculate: days from dates, total = days × daily_rate.
Check car not double-booked on same dates.
CRUD + list filters (status, car, customer, date range).
Update car status (Louée/Disponible) when reservation saved.
```

---

### Prompt 2 — UI

```
Build /reservations page:
- table: reference, customer, car, pickup→return dates, total DH, status badge, payment badge
- create/edit form: pick car, customer, dates+times, chauffeur optional, deposit, notes
- auto price calculation
- calendar view optional (one row per car, bars for bookings)
French labels.
```

---

# Payments — Simple prompts

**Types:** rental, deposit, deposit_return  
**Methods:** cash, card, bank_transfer

---

### Prompt 1 — All in one

```
Add payments module linked to reservations:

Table: id, reservation_id, type, amount, method, status, reference, notes, paid_at.

CRUD on reservation detail + global /payments list.
When payment saved → update reservation payment_status (unpaid/partial/paid).
Show payment history per reservation.
French UI, amounts in DH.
```

---

# Contracts — Simple prompts

**Status:** draft, active, closed, cancelled

---

### Prompt 1 — Database + Backend

```
Add contracts module (needs reservation):

Table: reservation_id, customer_id, car_id, contract_number (auto),
status, pickup/return datetime, daily_rate, billed_days, total_amount,
deposit_amount, franchise fields, VAT fields, damage marks (JSON),
equipment checklist (JSON), signatures, PDF path, created_at.

Create contract from reservation (copy data).
Generate PDF contract (use pdf library in main process).
Statuses: draft → active → closed.
```

---

### Prompt 2 — UI

```
Build /contracts page:
- list: number, customer, car, dates, total, status
- create from reservation button
- edit form + generate/download PDF
- car condition diagram for damages (optional phase 2)
French UI.
```

---

# Expenses — Simple prompts

**Categories:** fuel, maintenance, insurance, rent, salaries, utilities, marketing, office, other

---

### Prompt 1 — All in one

```
Add expenses module:

Table: id, title, category, amount, expense_date, payment_method, receipt_path, notes, created_at.

CRUD + list with filters (category, date range).
Upload receipt photo/PDF.
Export Excel optional.
Route /expenses. French UI, DH amounts.
```

---

# Chauffeurs — Simple prompts

(Same idea as customers — driver documents)

---

### Prompt 1 — All in one

```
Add chauffeurs module (like customers but for drivers):

Fields: name, phone, birth info, address, CIN/passport/permis + PDFs + expiry dates, is_active, notes.

CRUD + /chauffeurs list page.
Link to reservations (optional chauffeur_id).
Only active chauffeurs in reservation dropdown.
French UI.
```

---

# Dashboard — Simple prompts

---

### Prompt 1 — All in one

```
Build home dashboard / (after cars, reservations, payments, expenses exist):

Stat cards:
- total cars, disponible, louée, hors service
- reservations today / this month
- revenue this month (payments)
- expenses this month
- unpaid balances count

Simple charts optional: reservations per month, revenue vs expenses.

Quick links: add reservation, add car, add customer.
Notifications list: document expiries (car + customer), returns due today.

French labels, clean admin layout.
```

---

## Build order (reminder)

```
1. Cars ✅
2. Customers
3. Reservations  ← needs 1 + 2
4. Payments      ← needs 3
5. Contracts     ← needs 3
6. Expenses
7. Chauffeurs    ← optional before reservations
8. Dashboard     ← last
```
