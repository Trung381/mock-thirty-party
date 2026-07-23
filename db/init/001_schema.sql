CREATE TABLE IF NOT EXISTS evn_customers (
  id BIGSERIAL PRIMARY KEY,
  customer_code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'EVN',
  address TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evn_bills (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES evn_customers(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  amount_vnd INTEGER NOT NULL DEFAULT 0,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'unpaid',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, period)
);

CREATE INDEX IF NOT EXISTS idx_evn_customers_code ON evn_customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_evn_customers_phone ON evn_customers(phone);
CREATE INDEX IF NOT EXISTS idx_evn_bills_customer_period ON evn_bills(customer_id, period);

CREATE TABLE IF NOT EXISTS callytics_call_completed_webhooks (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL UNIQUE,
  delivery_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'call.completed',
  session_id TEXT NOT NULL DEFAULT '',
  call_uuid TEXT NOT NULL DEFAULT '',
  headers JSONB NOT NULL DEFAULT '{}',
  payload JSONB NOT NULL DEFAULT '{}',
  received_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_callytics_call_completed_call_uuid
  ON callytics_call_completed_webhooks(call_uuid);

INSERT INTO evn_customers (customer_code, customer_name, phone, region, address, metadata)
VALUES
  ('PD0102458', 'Nguyen Van Trung', '0342387314', 'EVNHANOI', 'Ha Noi', '{"gender":"male"}'),
  ('PX0102458', 'Tran Van Trung', '0340000001', 'EVNHANOI', 'Ha Noi', '{"gender":"male"}'),
  ('PA0102458', 'Nguyen Thi Trang', '0350000002', 'EVNHANOI', 'Ha Noi', '{"gender":"female"}'),
  ('EVN000001', 'Khach hang kiem thu', '0390000000', 'EVN', 'Test', '{}')
ON CONFLICT (customer_code) DO NOTHING;

INSERT INTO evn_bills (customer_id, period, amount_vnd, due_date, status)
SELECT id, '05/2026', 1250000, DATE '2026-06-10', 'unpaid'
FROM evn_customers WHERE customer_code = 'PD0102458'
ON CONFLICT (customer_id, period) DO NOTHING;

INSERT INTO evn_bills (customer_id, period, amount_vnd, due_date, status)
SELECT id, '05/2026', 980000, DATE '2026-06-11', 'unpaid'
FROM evn_customers WHERE customer_code = 'PX0102458'
ON CONFLICT (customer_id, period) DO NOTHING;

INSERT INTO evn_bills (customer_id, period, amount_vnd, due_date, status)
SELECT id, '05/2026', 640000, DATE '2026-06-12', 'unpaid'
FROM evn_customers WHERE customer_code = 'PA0102458'
ON CONFLICT (customer_id, period) DO NOTHING;

INSERT INTO evn_bills (customer_id, period, amount_vnd, due_date, status)
SELECT id, '05/2026', 0, NULL, 'paid'
FROM evn_customers WHERE customer_code = 'EVN000001'
ON CONFLICT (customer_id, period) DO NOTHING;
