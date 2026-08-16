import { SQL_NOW } from './local-date'

/** Cars currently out: status louee, enriched from contract (active/draft) or reservation. */
export const CARS_IN_USE_SQL = `
  SELECT
    ca.id as car_id,
    ca.name as car_name,
    ca.plate_number,
    COALESCE(
      (SELECT cu.name FROM contracts ct
       JOIN customers cu ON cu.id = ct.client_id
       WHERE ct.car_id = ca.id AND ct.deleted_at IS NULL AND ct.status IN ('active', 'draft')
       ORDER BY CASE ct.status WHEN 'active' THEN 0 ELSE 1 END, ct.id DESC
       LIMIT 1),
      (SELECT cu.name FROM reservations rs
       JOIN customers cu ON cu.id = rs.customer_id
       WHERE rs.car_id = ca.id AND rs.status IN ('pending', 'confirmed')
         AND datetime(rs.return_date) > ${SQL_NOW}
       ORDER BY rs.id DESC LIMIT 1),
      ''
    ) as client_name,
    COALESCE(
      (SELECT COALESCE(NULLIF(ct.return_at, ''), ct.end_date) FROM contracts ct
       WHERE ct.car_id = ca.id AND ct.deleted_at IS NULL AND ct.status IN ('active', 'draft')
       ORDER BY CASE ct.status WHEN 'active' THEN 0 ELSE 1 END, ct.id DESC LIMIT 1),
      (SELECT rs.return_date FROM reservations rs
       WHERE rs.car_id = ca.id AND rs.status IN ('pending', 'confirmed')
         AND datetime(rs.return_date) > ${SQL_NOW}
       ORDER BY rs.id DESC LIMIT 1),
      ''
    ) as return_at,
    (SELECT ct.id FROM contracts ct
     WHERE ct.car_id = ca.id AND ct.deleted_at IS NULL AND ct.status IN ('active', 'draft')
     ORDER BY CASE ct.status WHEN 'active' THEN 0 ELSE 1 END, ct.id DESC LIMIT 1) as contract_id,
    (SELECT ct.contract_number FROM contracts ct
     WHERE ct.car_id = ca.id AND ct.deleted_at IS NULL AND ct.status IN ('active', 'draft')
     ORDER BY CASE ct.status WHEN 'active' THEN 0 ELSE 1 END, ct.id DESC LIMIT 1) as contract_number,
    (SELECT ct.status FROM contracts ct
     WHERE ct.car_id = ca.id AND ct.deleted_at IS NULL AND ct.status IN ('active', 'draft')
     ORDER BY CASE ct.status WHEN 'active' THEN 0 ELSE 1 END, ct.id DESC LIMIT 1) as contract_status,
    (SELECT rs.id FROM reservations rs
     WHERE rs.car_id = ca.id AND rs.status IN ('pending', 'confirmed')
       AND datetime(rs.return_date) > ${SQL_NOW}
     ORDER BY rs.id DESC LIMIT 1) as reservation_id,
    (SELECT rs.reference FROM reservations rs
     WHERE rs.car_id = ca.id AND rs.status IN ('pending', 'confirmed')
       AND datetime(rs.return_date) > ${SQL_NOW}
     ORDER BY rs.id DESC LIMIT 1) as reservation_reference,
    (SELECT rs.status FROM reservations rs
     WHERE rs.car_id = ca.id AND rs.status IN ('pending', 'confirmed')
       AND datetime(rs.return_date) > ${SQL_NOW}
     ORDER BY rs.id DESC LIMIT 1) as reservation_status
  FROM cars ca
  WHERE ca.status = 'louee'
  ORDER BY return_at ASC
  LIMIT 12
`

export const UPCOMING_RETURNS_SQL = `
  SELECT * FROM (
    SELECT
      c.id as id,
      'contract' as kind,
      c.contract_number as reference,
      cu.name as client_name,
      ca.name as car_name,
      ca.plate_number as plate_number,
      COALESCE(NULLIF(c.return_at, ''), c.end_date) as return_at,
      c.status as status,
      CASE WHEN datetime(COALESCE(NULLIF(c.return_at, ''), c.end_date)) < ${SQL_NOW} THEN 1 ELSE 0 END as is_overdue,
      c.id as contract_id,
      NULL as reservation_id,
      ca.id as car_id
    FROM contracts c
    JOIN customers cu ON cu.id = c.client_id
    JOIN cars ca ON ca.id = c.car_id
    WHERE c.deleted_at IS NULL
      AND c.status IN ('active', 'draft')
      AND date(COALESCE(NULLIF(c.return_at, ''), c.end_date)) <= date('now', 'localtime', '+7 days')

    UNION ALL

    SELECT
      r.id as id,
      'reservation' as kind,
      r.reference as reference,
      cu.name as client_name,
      ca.name as car_name,
      ca.plate_number as plate_number,
      r.return_date as return_at,
      r.status as status,
      CASE WHEN datetime(r.return_date) < ${SQL_NOW} THEN 1 ELSE 0 END as is_overdue,
      NULL as contract_id,
      r.id as reservation_id,
      ca.id as car_id
    FROM reservations r
    JOIN customers cu ON cu.id = r.customer_id
    JOIN cars ca ON ca.id = r.car_id
    WHERE r.status IN ('pending', 'confirmed')
      AND date(r.return_date) <= date('now', 'localtime', '+7 days')
      AND NOT EXISTS (
        SELECT 1 FROM contracts c2
        WHERE c2.reservation_id = r.id AND c2.deleted_at IS NULL
          AND c2.status IN ('active', 'draft')
      )
  ) combined
  ORDER BY return_at ASC
  LIMIT 12
`

/** Active rentals in progress: active contracts + confirmed/pending reservations without duplicate contract row. */
export const RENTALS_IN_PROGRESS_COUNT_SQL = `
  SELECT (
    (SELECT COUNT(*) FROM contracts WHERE deleted_at IS NULL AND status = 'active')
    +
    (SELECT COUNT(*) FROM reservations r
     WHERE r.status IN ('pending', 'confirmed')
       AND datetime(r.return_date) > ${SQL_NOW}
       AND NOT EXISTS (
         SELECT 1 FROM contracts c
         WHERE c.reservation_id = r.id AND c.deleted_at IS NULL AND c.status = 'active'
       ))
  ) as c
`

export const OVERDUE_RENTALS_COUNT_SQL = `
  SELECT (
    (SELECT COUNT(*) FROM contracts
     WHERE deleted_at IS NULL AND status IN ('active', 'draft')
       AND datetime(COALESCE(NULLIF(return_at, ''), end_date)) < ${SQL_NOW})
    +
    (SELECT COUNT(*) FROM reservations r
     WHERE r.status IN ('pending', 'confirmed')
       AND datetime(r.return_date) < ${SQL_NOW}
       AND NOT EXISTS (
         SELECT 1 FROM contracts c
         WHERE c.reservation_id = r.id AND c.deleted_at IS NULL
           AND c.status IN ('active', 'draft')
           AND datetime(COALESCE(NULLIF(c.return_at, ''), c.end_date)) < ${SQL_NOW}
       ))
  ) as c
`
