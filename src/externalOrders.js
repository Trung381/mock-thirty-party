const DEFAULT_UPSTREAM_URL = 'http://139.162.40.219:3000/api/external-orders';
const DEFAULT_TIMEOUT_MS = 5000;

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

function upstreamUrl() {
  return text(process.env.UPSTREAM_EXTERNAL_ORDERS_URL) || DEFAULT_UPSTREAM_URL;
}

function timeoutMs() {
  const value = Number(process.env.UPSTREAM_EXTERNAL_ORDERS_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function upstreamPayload(argumentsValue) {
  const payload = {
    phone: text(argumentsValue.phone),
    customerName: text(argumentsValue.customerName),
    deliveryDate: text(argumentsValue.deliveryDate),
    message: text(argumentsValue.message),
    source: text(argumentsValue.source) || 'voice',
  };
  const externalOrderId = text(argumentsValue.externalOrderId);
  if (externalOrderId) payload.externalOrderId = externalOrderId;
  return payload;
}

function customerMessage(result) {
  const code = text(result?.order?.code);
  const duplicate = result?.duplicate === true;
  if (duplicate && code) {
    return 'Dạ, đơn hàng của anh/chị đã được hệ thống ghi nhận trước đó với mã đơn ' + code + ' ạ.';
  }
  if (code) {
    return 'Dạ, em đã ghi nhận đơn hàng của anh/chị với mã đơn ' + code + ' ạ.';
  }
  return 'Dạ, em đã ghi nhận đơn hàng của anh/chị và đang kiểm tra lại thông tin ạ.';
}

async function parseJson(response) {
  const responseText = await response.text();
  if (!responseText) return null;
  try {
    return JSON.parse(responseText);
  } catch {
    return null;
  }
}

/**
 * Gateway adapter:
 * Callbot envelope -> An Việt's direct /api/external-orders request -> Callbot response contract.
 */
export async function createExternalOrder(body) {
  const argumentsValue = toolArguments(body);
  if (!argumentsValue) {
    return invalid(
      'INVALID_WEBHOOK_ENVELOPE',
      'arguments object is required',
      'Dạ em chưa nhận được thông tin đơn hàng hợp lệ để tạo đơn ạ.',
    );
  }

  const payload = upstreamPayload(argumentsValue);
  if (!payload.phone || !payload.customerName || !payload.deliveryDate || !payload.message) {
    return invalid(
      'CREATE_ORDER_FAILED',
      'phone, customerName, deliveryDate and message are required',
      'Dạ em xin lỗi, em chưa đủ thông tin để tạo đơn. Anh/chị cho em kiểm tra lại tên, số điện thoại, ngày giao và nội dung đơn nhé.',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs());
  let response;
  try {
    response = await fetch(upstreamUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return invalid(
      timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
      timedOut ? 'Upstream create-order API timed out' : 'Upstream create-order API is unavailable',
      'Dạ em xin lỗi, hệ thống tạo đơn đang bận nên em chưa thể lưu đơn cho anh/chị lúc này ạ.',
    );
  } finally {
    clearTimeout(timeout);
  }

  const upstreamResult = await parseJson(response);
  if (!response.ok) {
    return invalid(
      'UPSTREAM_CREATE_ORDER_FAILED',
      'Upstream create-order API returned HTTP ' + response.status,
      text(upstreamResult?.user_message_vi) || 'Dạ em xin lỗi, hệ thống tạo đơn chưa thể xử lý yêu cầu của anh/chị ạ.',
    );
  }
  if (!upstreamResult || typeof upstreamResult !== 'object') {
    return invalid(
      'UPSTREAM_INVALID_RESPONSE',
      'Upstream create-order API did not return JSON',
      'Dạ em xin lỗi, hệ thống tạo đơn trả về dữ liệu chưa hợp lệ nên em chưa thể xác nhận đơn ạ.',
    );
  }
  if (upstreamResult.success === false) {
    return invalid(
      text(upstreamResult.error_code) || 'UPSTREAM_CREATE_ORDER_FAILED',
      text(upstreamResult.error_message) || 'Upstream create-order API rejected the request',
      text(upstreamResult.user_message_vi) || 'Dạ em xin lỗi, hệ thống tạo đơn chưa thể xử lý yêu cầu của anh/chị ạ.',
    );
  }

  // An Việt currently returns the order object directly. The fallback also
  // accepts a provider that already wraps its data in { success, result }.
  const result = upstreamResult.success === true && upstreamResult.result
    ? upstreamResult.result
    : upstreamResult;
  return {
    success: true,
    result,
    user_message_vi: text(upstreamResult.user_message_vi) || customerMessage(result),
  };
}
