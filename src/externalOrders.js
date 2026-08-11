import { query } from './db.js';
import { compactPhone } from './text.js';

let schemaReady;

function text(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function toolArguments(body) {
  return body && typeof body.arguments === 'object' && body.arguments !== null
    ? body.arguments
    : null;
}

function invalid(errorCode, errorMessage, userMessageVi) {
  return {
    success: false,
    result: null,
    error_code: errorCode,
    error_message: errorMessage,
    user_message_vi: userMessageVi,
  };
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function vietnameseDate(value) {
  const [year, month, day] = dateText(value).split('-');
  return 'ngày ' + day + ' tháng ' + month + ' năm ' + year;
}

function dateText(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return text(value).slice(0, 10);
}

function customerAddress(customerName) {
  const parts = text(customerName).split(' ').filter(Boolean);
  return parts.at(-1) || 'anh/chị';
}

function mapResult(row, duplicate) {
  return {
    customerId: 'CUS-' + row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    duplicate,
    order: {
      id: 'ORDER-' + row.id,
      code: row.order_code,
      botStatus: row.bot_status,
      deliveryDate: dateText(row.delivery_date),
    },
  };
}

function successMessage(row, duplicate) {
  const customer = customerAddress(row.customer_name);
  if (duplicate) {
    return 'Dạ, đơn hàng của anh/chị ' + customer + ' đã được hệ thống ghi nhận trước đó với mã đơn ' + row.order_code + ' ạ.';
  }
  return 'Dạ, em đã ghi nhận đơn hàng cho anh/chị ' + customer + ' với mã đơn ' + row.order_code + '. Đơn đang chờ kiểm tra và dự kiến giao vào ' + vietnameseDate(row.delivery_date) + ' ạ.';
}

async function ensureExternalOrdersSchema() {
  if (!schemaReady) {
    schemaReady = query(
      [
        'CREATE TABLE IF NOT EXISTS external_orders (',
        '  id BIGSERIAL PRIMARY KEY,',
        '  order_code TEXT UNIQUE,',
        '  external_order_id TEXT UNIQUE,',
        '  invocation_id TEXT NOT NULL UNIQUE,',
        "  session_id TEXT NOT NULL DEFAULT '',",
        "  tenant_id TEXT NOT NULL DEFAULT '',",
        "  correlation_id TEXT NOT NULL DEFAULT '',",
        "  caller_number TEXT NOT NULL DEFAULT '',",
        '  phone TEXT NOT NULL,',
        '  customer_name TEXT NOT NULL,',
        '  delivery_date DATE NOT NULL,',
        '  order_message TEXT NOT NULL,',
        "  source TEXT NOT NULL DEFAULT 'voice',",
        '  conversation_id TEXT NOT NULL,',
        '  message_id TEXT NOT NULL,',
        "  bot_status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',",
        "  raw_request JSONB NOT NULL DEFAULT '{}',",
        '  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),',
        '  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()',
        ')',
      ].join('\n'),
    );
  }
  return schemaReady;
}

async function findExisting(invocationId, externalOrderId) {
  const { rows } = await query(
    [
      'SELECT *',
      'FROM external_orders',
      'WHERE invocation_id = $1',
      "   OR ($2 <> '' AND external_order_id = $2)",
      'ORDER BY id ASC',
      'LIMIT 1',
    ].join('\n'),
    [invocationId, externalOrderId],
  );
  return rows[0] || null;
}

export async function createExternalOrder(body) {
  await ensureExternalOrdersSchema();
  const input = toolArguments(body);
  if (!input) {
    return invalid(
      'INVALID_WEBHOOK_ENVELOPE',
      'arguments object is required',
      'Dạ em chưa nhận được thông tin đơn hàng hợp lệ để tạo đơn ạ.',
    );
  }

  const phone = compactPhone(input.phone);
  const customerName = text(input.customerName);
  const deliveryDate = text(input.deliveryDate);
  const message = text(input.message);
  const externalOrderId = text(input.externalOrderId);
  const source = text(input.source) || 'voice';
  const invocationId = text(body.invocation_id);

  if (!phone || !customerName || !deliveryDate || !message) {
    return invalid(
      'CREATE_ORDER_FAILED',
      'phone, customerName, deliveryDate and message are required',
      'Dạ em xin lỗi, em chưa đủ thông tin để tạo đơn. Anh/chị cho em kiểm tra lại tên, số điện thoại, ngày giao và nội dung đơn nhé.',
    );
  }
  if (!isIsoDate(deliveryDate)) {
    return invalid(
      'CREATE_ORDER_FAILED',
      'deliveryDate must use YYYY-MM-DD',
      'Dạ em xin lỗi, ngày giao hàng chưa đúng định dạng nên em chưa thể tạo đơn ạ.',
    );
  }
  if (!invocationId) {
    return invalid(
      'CREATE_ORDER_FAILED',
      'invocation_id is required for idempotency',
      'Dạ em xin lỗi, hệ thống chưa thể xác thực yêu cầu tạo đơn này ạ.',
    );
  }

  const existing = await findExisting(invocationId, externalOrderId);
  if (existing) {
    return {
      success: true,
      result: mapResult(existing, true),
      user_message_vi: successMessage(existing, true),
    };
  }

  const { rows: createdRows } = await query(
    [
      'INSERT INTO external_orders (',
      '  invocation_id, external_order_id, session_id, tenant_id, correlation_id,',
      '  caller_number, phone, customer_name, delivery_date, order_message, source,',
      '  conversation_id, message_id, bot_status, raw_request',
      ')',
      "VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12, $13, 'NEEDS_REVIEW', $14::jsonb)",
      'RETURNING *',
    ].join('\n'),
    [
      invocationId,
      externalOrderId,
      text(body.session_id),
      text(body.tenant_id),
      text(body.correlation_id),
      compactPhone(body.caller_number),
      phone,
      customerName,
      deliveryDate,
      message,
      source,
      'CONV-' + invocationId,
      'MSG-' + invocationId,
      JSON.stringify(body),
    ],
  );

  const created = createdRows[0];
  const orderCode = 'DH' + String(created.id).padStart(6, '0');
  const { rows: orderRows } = await query(
    'UPDATE external_orders SET order_code = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [orderCode, created.id],
  );
  const order = orderRows[0];

  return {
    success: true,
    result: mapResult(order, false),
    user_message_vi: successMessage(order, false),
  };
}

export async function listExternalOrders() {
  await ensureExternalOrdersSchema();
  const { rows } = await query(
    [
      'SELECT id, order_code, external_order_id, invocation_id, phone, customer_name,',
      '  delivery_date, order_message, source, bot_status, created_at, updated_at',
      'FROM external_orders',
      'ORDER BY id DESC',
      'LIMIT 100',
    ].join('\n'),
  );
  return { success: true, result: rows };
}
