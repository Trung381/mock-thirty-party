import { query } from './db.js';
import { compactPhone } from './text.js';

function args(body) {
  return body && typeof body.arguments === 'object' && body.arguments !== null
    ? body.arguments
    : body || {};
}

function makeId(prefix) {
  return `${prefix}${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
}

function text(value) {
  return String(value || '').trim();
}

function list(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function invalid(errorCode, errorMessage, userMessageVi) {
  return {
    success: false,
    error_code: errorCode,
    error_message: errorMessage,
    user_message_vi: userMessageVi,
  };
}

function mapDemo(row) {
  return {
    demo_id: row.demo_id,
    contact_phone: row.contact_phone,
    customer_name: row.customer_name,
    organization_name: row.organization_name,
    role: row.role,
    pain_point: row.pain_point,
    interest_level: row.interest_level,
    demo_time: row.demo_time,
    status: row.status,
    notes: row.notes,
    metadata: row.metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapCallback(row) {
  return {
    callback_id: row.callback_id,
    contact_phone: row.contact_phone,
    customer_name: row.customer_name,
    organization_name: row.organization_name,
    callback_time: row.callback_time,
    reason: row.reason,
    status: row.status,
    notes: row.notes,
    metadata: row.metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapOutcome(row) {
  return {
    report_id: row.report_id,
    contact_phone: row.contact_phone,
    customer_name: row.customer_name,
    organization_name: row.organization_name,
    lead_status: row.lead_status,
    pain_point: row.pain_point,
    interest_level: row.interest_level,
    demo_time: row.demo_time,
    callback_time: row.callback_time,
    not_interested_reason: row.not_interested_reason,
    summary: row.summary,
    next_action: row.next_action,
    notes: row.notes,
    metadata: row.metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function scheduleDemo(body) {
  const input = args(body);
  const contactPhone = compactPhone(input.contact_phone || input.phone || input.caller_number);
  const demoTime = text(input.demo_time);
  const painPoint = text(input.pain_point);

  if (!contactPhone || !demoTime || !painPoint) {
    return invalid(
      'invalid_demo_request',
      'contact_phone, demo_time and pain_point are required',
      'Dạ anh/chị cho em xin số điện thoại, nhu cầu chính và thời gian demo phù hợp ạ.',
    );
  }

  const demoId = makeId('DEMO');
  const metadata = {
    confirmed_fields: list(input.confirmed_fields),
    source: text(input.source || 'callbot_outbound'),
    raw: input.metadata || {},
  };
  const { rows } = await query(
    `
      INSERT INTO health_demo_schedules (
        demo_id, contact_phone, customer_name, organization_name, role,
        pain_point, interest_level, demo_time, status, notes, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled', $9, $10::jsonb)
      RETURNING *
    `,
    [
      demoId,
      contactPhone,
      text(input.customer_name),
      text(input.organization_name),
      text(input.role),
      painPoint,
      text(input.interest_level),
      demoTime,
      text(input.notes),
      JSON.stringify(metadata),
    ],
  );
  return { success: true, result: mapDemo(rows[0]) };
}

export async function scheduleCallback(body) {
  const input = args(body);
  const contactPhone = compactPhone(input.contact_phone || input.phone || input.caller_number);
  const callbackTime = text(input.callback_time);

  if (!contactPhone || !callbackTime) {
    return invalid(
      'invalid_callback_request',
      'contact_phone and callback_time are required',
      'Dạ anh/chị cho em xin số điện thoại và thời gian gọi lại phù hợp ạ.',
    );
  }

  const callbackId = makeId('CALL');
  const metadata = {
    confirmed_fields: list(input.confirmed_fields),
    source: text(input.source || 'callbot_outbound'),
    raw: input.metadata || {},
  };
  const { rows } = await query(
    `
      INSERT INTO health_callbacks (
        callback_id, contact_phone, customer_name, organization_name,
        callback_time, reason, status, notes, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, $8::jsonb)
      RETURNING *
    `,
    [
      callbackId,
      contactPhone,
      text(input.customer_name),
      text(input.organization_name),
      callbackTime,
      text(input.reason),
      text(input.notes),
      JSON.stringify(metadata),
    ],
  );
  return { success: true, result: mapCallback(rows[0]) };
}

export async function reportLeadOutcome(body) {
  const input = args(body);
  const leadStatus = text(input.lead_status);

  if (!leadStatus) {
    return invalid(
      'invalid_lead_outcome',
      'lead_status is required',
      'Dạ hệ thống cần trạng thái kết quả cuộc gọi để ghi nhận báo cáo ạ.',
    );
  }

  const reportId = makeId('LEAD');
  const metadata = {
    source: text(input.source || 'callbot_outbound'),
    raw: input.metadata || {},
  };
  const { rows } = await query(
    `
      INSERT INTO health_lead_outcomes (
        report_id, contact_phone, customer_name, organization_name, lead_status,
        pain_point, interest_level, demo_time, callback_time, not_interested_reason,
        summary, next_action, notes, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
      RETURNING *
    `,
    [
      reportId,
      compactPhone(input.contact_phone || input.phone || input.caller_number),
      text(input.customer_name),
      text(input.organization_name),
      leadStatus,
      text(input.pain_point),
      text(input.interest_level),
      text(input.demo_time),
      text(input.callback_time),
      text(input.not_interested_reason),
      text(input.summary),
      text(input.next_action),
      text(input.notes),
      JSON.stringify(metadata),
    ],
  );
  return { success: true, result: mapOutcome(rows[0]) };
}

export async function listDemoSchedules() {
  const { rows } = await query('SELECT * FROM health_demo_schedules ORDER BY created_at DESC LIMIT 50');
  return { success: true, data: rows.map(mapDemo) };
}

export async function listCallbacks() {
  const { rows } = await query('SELECT * FROM health_callbacks ORDER BY created_at DESC LIMIT 50');
  return { success: true, data: rows.map(mapCallback) };
}

export async function listLeadOutcomes() {
  const { rows } = await query('SELECT * FROM health_lead_outcomes ORDER BY created_at DESC LIMIT 50');
  return { success: true, data: rows.map(mapOutcome) };
}
