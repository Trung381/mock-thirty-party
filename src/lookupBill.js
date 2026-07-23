import { query } from './db.js';
import { asciiFold, compactCode, compactPhone, isSubsequence, maskPhone } from './text.js';

function toolArguments(body) {
  return body && typeof body.arguments === 'object' && body.arguments !== null
    ? body.arguments
    : body || {};
}

function billPayload(row) {
  return {
    match_status: 'exact',
    customer_code: row.customer_code,
    customer_name: row.customer_name,
    phone: row.phone,
    region: row.region,
    address: row.address,
    period: row.period,
    amount_vnd: Number(row.amount_vnd || 0),
    due_date: row.due_date ? row.due_date.toISOString().slice(0, 10) : '',
    status: row.status,
    metadata: row.metadata || {},
  };
}

async function loadCandidates() {
  const { rows } = await query(`
    SELECT
      c.id,
      c.customer_code,
      c.customer_name,
      c.phone,
      c.region,
      c.address,
      c.metadata,
      b.period,
      b.amount_vnd,
      b.due_date,
      b.status
    FROM evn_customers c
    LEFT JOIN LATERAL (
      SELECT period, amount_vnd, due_date, status
      FROM evn_bills
      WHERE customer_id = c.id
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) b ON TRUE
    ORDER BY c.id ASC
  `);
  return rows;
}

export async function lookupBill(body) {
  const args = toolArguments(body);
  const code = compactCode(args.customer_code);
  const phone = compactPhone(args.phone);
  const name = asciiFold(args.customer_name);
  const confirmedFields = Array.isArray(args.confirmed_fields) ? args.confirmed_fields : [];

  let matches = await loadCandidates();

  if (code) {
    const exact = matches.filter((row) => compactCode(row.customer_code) === code);
    matches = exact.length > 0
      ? exact
      : matches.filter((row) => isSubsequence(code, compactCode(row.customer_code)));
  }
  if (phone) {
    matches = matches.filter((row) => compactPhone(row.phone) === phone);
  }
  if (name) {
    matches = matches.filter((row) => asciiFold(row.customer_name).includes(name));
  }

  if (matches.length === 1) {
    return {
      success: true,
      result: {
        ...billPayload(matches[0]),
        confirmed_fields: confirmedFields,
      },
    };
  }

  if (matches.length > 1) {
    return {
      success: true,
      result: {
        match_status: 'ambiguous',
        message: 'multiple_customers_matched',
        input: { customer_code: code, phone, customer_name: name, confirmed_fields: confirmedFields },
        candidates: matches.slice(0, 5).map((row) => ({
          customer_code: row.customer_code,
          customer_name: row.customer_name,
          phone_masked: maskPhone(row.phone),
        })),
      },
    };
  }

  return {
    success: false,
    error_code: 'customer_not_found',
    error_message: 'customer not found',
    user_message_vi: 'Da em chua tra duoc thong tin nay, anh chi doc them so dien thoai hoac ten giup em a.',
    result: { customer_code: code, phone, customer_name: name, confirmed_fields: confirmedFields },
  };
}
