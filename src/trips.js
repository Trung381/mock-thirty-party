import { query } from './db.js';
import { compactPhone } from './text.js';

function args(body) {
  return body && typeof body.arguments === 'object' && body.arguments !== null
    ? body.arguments
    : body || {};
}

function makeTripId() {
  return `TRIP${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
}

function mapTrip(row) {
  return {
    trip_id: row.trip_id,
    phone: row.phone,
    customer_name: row.customer_name,
    pickup_address: row.pickup_address,
    destination_address: row.destination_address,
    pickup_time: row.pickup_time,
    car_type: row.car_type,
    status: row.status,
    fare_estimate_vnd: Number(row.fare_estimate_vnd || 0),
    driver_name: row.driver_name,
    driver_phone: row.driver_phone,
    metadata: row.metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createTrip(body) {
  const input = args(body);
  const phone = compactPhone(input.phone || input.caller_number);
  const pickup = String(input.pickup_address || input.pickup || '').trim();
  const destination = String(input.destination_address || input.destination || '').trim();
  if (!phone || !pickup || !destination) {
    return {
      success: false,
      error_code: 'invalid_trip_request',
      error_message: 'phone, pickup_address and destination_address are required',
      user_message_vi: 'Dạ anh/chị cho em xin số điện thoại, điểm đón và điểm đến để tạo chuyến ạ.',
    };
  }

  const customerRows = await query('SELECT customer_name FROM partner_customers WHERE phone = $1 LIMIT 1', [phone]);
  const customerName = String(input.customer_name || customerRows.rows[0]?.customer_name || '').trim();
  const tripId = makeTripId();
  const fare = Number(input.fare_estimate_vnd || 85000);
  const { rows } = await query(
    `
      INSERT INTO taxi_trips (
        trip_id, phone, customer_name, pickup_address, destination_address,
        pickup_time, car_type, status, fare_estimate_vnd, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'created', $8, $9::jsonb)
      RETURNING *
    `,
    [
      tripId,
      phone,
      customerName,
      pickup,
      destination,
      String(input.pickup_time || 'asap'),
      String(input.car_type || 'standard'),
      fare,
      JSON.stringify(input.metadata || {}),
    ],
  );
  return { success: true, result: mapTrip(rows[0]) };
}

export async function getTripById(tripId) {
  const { rows } = await query('SELECT * FROM taxi_trips WHERE trip_id = $1 LIMIT 1', [String(tripId || '').trim()]);
  if (!rows[0]) {
    return { success: false, error_code: 'trip_not_found', error_message: 'trip not found' };
  }
  return { success: true, result: mapTrip(rows[0]) };
}

export async function lookupTrip(body) {
  const input = args(body);
  const tripId = String(input.trip_id || '').trim();
  if (tripId) return getTripById(tripId);
  const phone = compactPhone(input.phone || input.caller_number);
  if (!phone) {
    return { success: false, error_code: 'missing_lookup_key', error_message: 'trip_id or phone is required' };
  }
  const { rows } = await query(
    'SELECT * FROM taxi_trips WHERE phone = $1 ORDER BY created_at DESC LIMIT 5',
    [phone],
  );
  return {
    success: true,
    result: {
      match_status: rows.length === 1 ? 'exact' : rows.length > 1 ? 'multiple' : 'not_found',
      trips: rows.map(mapTrip),
    },
  };
}

// The Taixe247 agent needs the active/latest booking only, while the generic
// lookup endpoint above remains useful for showing a customer's recent history.
export async function lookupLatestTrip(body) {
  const input = args(body);
  const tripId = String(input.trip_id || '').trim();
  if (tripId) return getTripById(tripId);

  const phone = compactPhone(input.phone || input.caller_number);
  if (!phone) {
    return { success: false, error_code: 'missing_lookup_key', error_message: 'trip_id or phone is required' };
  }

  const { rows } = await query(
    'SELECT * FROM taxi_trips WHERE phone = $1 ORDER BY created_at DESC LIMIT 1',
    [phone],
  );
  return {
    success: true,
    result: {
      match_status: rows[0] ? 'exact' : 'not_found',
      trips: rows.map(mapTrip),
    },
  };
}
