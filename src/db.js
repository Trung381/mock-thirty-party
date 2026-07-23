import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_SIZE || 10),
});

export async function query(sql, params = []) {
  return pool.query(sql, params);
}

export async function assertDbReady() {
  await query('SELECT 1');
}

export async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS partner_customers (
      id BIGSERIAL PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      segment TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS taxi_trips (
      id BIGSERIAL PRIMARY KEY,
      trip_id TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      pickup_address TEXT NOT NULL,
      destination_address TEXT NOT NULL,
      pickup_time TEXT NOT NULL DEFAULT '',
      car_type TEXT NOT NULL DEFAULT 'standard',
      status TEXT NOT NULL DEFAULT 'created',
      fare_estimate_vnd INTEGER NOT NULL DEFAULT 0,
      driver_name TEXT NOT NULL DEFAULT '',
      driver_phone TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS health_demo_schedules (
      id BIGSERIAL PRIMARY KEY,
      demo_id TEXT NOT NULL UNIQUE,
      contact_phone TEXT NOT NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      organization_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      pain_point TEXT NOT NULL,
      interest_level TEXT NOT NULL DEFAULT '',
      demo_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      notes TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS health_callbacks (
      id BIGSERIAL PRIMARY KEY,
      callback_id TEXT NOT NULL UNIQUE,
      contact_phone TEXT NOT NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      organization_name TEXT NOT NULL DEFAULT '',
      callback_time TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'scheduled',
      notes TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS health_lead_outcomes (
      id BIGSERIAL PRIMARY KEY,
      report_id TEXT NOT NULL UNIQUE,
      contact_phone TEXT NOT NULL DEFAULT '',
      customer_name TEXT NOT NULL DEFAULT '',
      organization_name TEXT NOT NULL DEFAULT '',
      lead_status TEXT NOT NULL,
      pain_point TEXT NOT NULL DEFAULT '',
      interest_level TEXT NOT NULL DEFAULT '',
      demo_time TEXT NOT NULL DEFAULT '',
      callback_time TEXT NOT NULL DEFAULT '',
      not_interested_reason TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
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
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_callytics_call_completed_call_uuid
    ON callytics_call_completed_webhooks(call_uuid)
  `);
  await query(`
    INSERT INTO partner_customers (phone, customer_name, display_name, gender, segment, metadata)
    VALUES
      ('0342387314', 'Nguyen Van Trung', 'anh Trung', 'male', 'VIP', '{"preferred_language":"vi","note":"Khách thường hỏi lịch sử chuyến đi và hóa đơn."}'),
      ('0340000001', 'Tran Van Trung', 'anh Trung', 'male', 'standard', '{}'),
      ('0350000002', 'Nguyen Thi Trang', 'chị Trang', 'female', 'standard', '{}')
    ON CONFLICT (phone) DO NOTHING
  `);
}
