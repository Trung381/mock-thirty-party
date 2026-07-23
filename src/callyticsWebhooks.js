import { query } from './db.js';

export async function receiveCallCompletedWebhook(headers, body) {
  const eventId = String(body?.event_id || '').trim();
  const idempotencyKey = String(body?.idempotency_key || headers['x-callytics-idempotency-key'] || '').trim();
  const sessionId = String(body?.call?.session_id || body?.report?.call?.session_id || '').trim();
  const callUuid = String(body?.call?.call_uuid || body?.report?.call?.call_uuid || '').trim();
  const eventType = String(body?.event_type || headers['x-callytics-event'] || 'call.completed').trim();
  const deliveryId = String(headers['x-callytics-delivery-id'] || '').trim();

  const { rows } = await query(
    `
      INSERT INTO callytics_call_completed_webhooks (
        event_id, idempotency_key, delivery_id, event_type, session_id, call_uuid, headers, payload
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
      ON CONFLICT (idempotency_key) DO UPDATE
      SET delivery_id = EXCLUDED.delivery_id,
          event_type = EXCLUDED.event_type,
          session_id = EXCLUDED.session_id,
          call_uuid = EXCLUDED.call_uuid,
          headers = EXCLUDED.headers,
          payload = EXCLUDED.payload,
          received_count = callytics_call_completed_webhooks.received_count + 1,
          updated_at = NOW()
      RETURNING id, event_id, idempotency_key, delivery_id, event_type, session_id, call_uuid,
        received_count, created_at, updated_at
    `,
    [
      eventId || idempotencyKey || deliveryId,
      idempotencyKey || eventId || deliveryId,
      deliveryId,
      eventType,
      sessionId,
      callUuid,
      JSON.stringify(headers || {}),
      JSON.stringify(body || {}),
    ],
  );
  return { success: true, accepted: true, data: rows[0] };
}

export async function listCallCompletedWebhooks() {
  const { rows } = await query(
    `
      SELECT id, event_id, idempotency_key, delivery_id, event_type, session_id, call_uuid,
        received_count, payload, created_at, updated_at
      FROM callytics_call_completed_webhooks
      ORDER BY id DESC
      LIMIT 100
    `,
  );
  return { success: true, data: rows };
}

export async function clearCallCompletedWebhooks() {
  const { rowCount } = await query('DELETE FROM callytics_call_completed_webhooks');
  return { success: true, deleted: rowCount };
}
