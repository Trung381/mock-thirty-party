import { query } from './db.js';
import { compactPhone } from './text.js';

export async function initContext(body) {
  const phone = compactPhone(body?.phone || body?.caller_number || body?.callee_number);
  const direction = String(body?.direction || 'inbound');
  if (!phone) {
    return {
      success: true,
      identified: false,
      match_status: 'not_found',
      metadata: { identified: false },
      agent_context: {},
    };
  }

  const customerRows = await query(
    `
      SELECT *
      FROM partner_customers
      WHERE phone = $1
      LIMIT 2
    `,
    [phone],
  );
  if (customerRows.rows.length !== 1) {
    return {
      success: true,
      identified: false,
      match_status: customerRows.rows.length > 1 ? 'ambiguous' : 'not_found',
      metadata: { identified: false },
      agent_context: {
        phone_candidate: phone,
        direction,
        hint: 'Không nhận diện chắc chắn khách hàng từ số điện thoại.',
      },
    };
  }

  const customer = customerRows.rows[0];
  const trips = await query(
    `
      SELECT trip_id, pickup_address, destination_address, pickup_time, car_type, status, fare_estimate_vnd, driver_name, driver_phone, created_at
      FROM taxi_trips
      WHERE phone = $1
      ORDER BY created_at DESC
      LIMIT 3
    `,
    [phone],
  );
  const evnRows = await query(
    `
      SELECT customer_code, customer_name, phone, region, address
      FROM evn_customers
      WHERE phone = $1
      ORDER BY id ASC
      LIMIT 5
    `,
    [phone],
  );

  return {
    success: true,
    identified: true,
    match_status: 'exact',
    metadata: {
      identified: true,
      customer_name: customer.display_name || customer.customer_name,
      gender: customer.gender,
      registered_phone_candidate: phone,
    },
    agent_context: {
      customer: {
        id: String(customer.id),
        phone,
        name: customer.customer_name,
        display_name: customer.display_name || customer.customer_name,
        gender: customer.gender,
        segment: customer.segment,
        metadata: customer.metadata || {},
      },
      direction,
      phone_candidate: phone,
      evn_contracts: evnRows.rows,
      recent_trips: trips.rows,
      business_summary: trips.rows.length > 0
        ? 'Khách có lịch sử chuyến đi gần đây, có thể hỗ trợ tra cứu hoặc tạo chuyến mới.'
        : 'Chưa có lịch sử chuyến đi gần đây trong hệ thống mock.',
    },
  };
}
