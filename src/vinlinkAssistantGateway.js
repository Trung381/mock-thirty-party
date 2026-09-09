import { randomUUID } from 'node:crypto';

const DEFAULT_BASE_URL = 'https://apigwdev.taixe247.vn';
const DEFAULT_TIMEOUT_MS = 5000;
const TOKEN_EARLY_REFRESH_MS = 60_000;

const demoPlaces = [
  { placeId: 'mock_tsn', name: 'Sân bay Tân Sơn Nhất', address: 'Sân bay Tân Sơn Nhất, Tân Bình, Thành phố Hồ Chí Minh', lat: 10.8188, lng: 106.6519 },
  { placeId: 'mock_q1', name: 'Quận 1', address: 'Quận 1, Thành phố Hồ Chí Minh', lat: 10.7769, lng: 106.7009 },
  { placeId: 'mock_cau_giay', name: 'Cầu Giấy', address: 'Cầu Giấy, Hà Nội', lat: 21.0306, lng: 105.7902 },
  { placeId: 'mock_noi_bai', name: 'Sân bay Nội Bài', address: 'Sân bay Nội Bài, Sóc Sơn, Hà Nội', lat: 21.2187, lng: 105.8042 },
];

const demoServices = [
  { serviceId: 1, code: 'CAR', name: 'Ô tô', groupName: 'Ô tô' },
  { serviceId: 2, code: 'MOTOBIKE', name: 'Xe máy', groupName: 'Xe máy' },
];

let tokenState = { accessToken: '', refreshToken: '', expiresAt: 0 };
let tokenFlight = null;
const mockQuotes = new Map();
const mockBookings = new Map();
const completedInvocations = new Map();

function text(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function argumentsFrom(body) {
  return body && typeof body.arguments === 'object' && body.arguments !== null ? body.arguments : null;
}

function read(input, ...names) {
  for (const name of names) {
    if (input[name] !== undefined && input[name] !== null && text(input[name])) return input[name];
  }
  return undefined;
}

function safePhone(value) {
  return text(value).replace(/[^0-9+]/g, '');
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

function config() {
  const timeout = Number(process.env.VINLINK_ASSISTANT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return {
    mode: text(process.env.VINLINK_ASSISTANT_MODE || 'mock').toLowerCase(),
    baseUrl: (text(process.env.VINLINK_ASSISTANT_API_BASE_URL) || DEFAULT_BASE_URL).replace(/\/$/, ''),
    username: text(process.env.VINLINK_ASSISTANT_USERNAME || 'ai_cskh'),
    password: String(process.env.VINLINK_ASSISTANT_PASSWORD || ''),
    staticAccessToken: text(process.env.VINLINK_ASSISTANT_ACCESS_TOKEN),
    defaultServiceId: number(process.env.VINLINK_ASSISTANT_DEFAULT_SERVICE_ID) || 1,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

function maskPhone(value) {
  const phone = safePhone(value);
  return phone.length > 4 ? `***${phone.slice(-4)}` : phone;
}

function log(event, data = {}) {
  console.info(JSON.stringify({ event, ...data }));
}

function traceId(body) {
  return text(body?.correlation_id) || randomUUID();
}

function requestId(body) {
  return text(body?.invocation_id) || randomUUID();
}

function placeRef(input, prefix) {
  const placeId = text(read(input, `${prefix}_place_id`, `${prefix}PlaceId`));
  if (placeId) return { placeId };
  const address = text(read(input, `${prefix}_address`, `${prefix}Address`));
  if (address) return { address };
  const lat = number(read(input, `${prefix}_lat`, `${prefix}Lat`));
  const lng = number(read(input, `${prefix}_lng`, `${prefix}Lng`));
  if (lat !== null && lng !== null) return { lat, lng };
  return null;
}

function customer(input) {
  const customerId = number(read(input, 'customer_id', 'customerId'));
  const customerPhone = safePhone(read(input, 'customer_phone', 'customerPhone', 'phone'));
  const result = {};
  if (customerId !== null) result.customerId = customerId;
  if (customerPhone) result.customerPhone = customerPhone;
  return Object.keys(result).length ? result : null;
}

function idempotencyKey(body) {
  return text(body?.invocation_id) || randomUUID();
}

function validationDetails(upstream) {
  const details = upstream?.error?.details;
  if (!Array.isArray(details)) return undefined;
  return details.slice(0, 10).map((detail) => ({
    field: text(detail?.field) || null,
    issue: text(detail?.issue) || null,
  }));
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

function saveTokens(payload) {
  const expiresIn = Number(payload?.expires_in);
  tokenState = {
    accessToken: text(payload?.access_token || payload?.accessToken),
    refreshToken: text(payload?.refresh_token || payload?.refreshToken),
    expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn * 1000 : 0),
  };
  return tokenState.accessToken;
}

async function loginOrRefresh() {
  const settings = config();
  if (!settings.password) throw new Error('VINLINK_ASSISTANT_PASSWORD is not configured');
  const useRefresh = Boolean(tokenState.refreshToken);
  const path = useRefresh ? '/api/v1/auth/refresh' : '/api/v1/auth/login';
  const payload = useRefresh
    ? { refreshToken: tokenState.refreshToken }
    : { username: settings.username, password: settings.password };
  const { response, body } = await fetchJson(`${settings.baseUrl}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }, settings.timeoutMs);
  if (!response.ok || !text(body?.access_token)) {
    if (useRefresh) tokenState = { accessToken: '', refreshToken: '', expiresAt: 0 };
    throw new Error(`Vinlink auth failed with HTTP ${response.status}`);
  }
  return saveTokens(body);
}

async function accessToken() {
  const settings = config();
  if (settings.staticAccessToken) return settings.staticAccessToken;
  if (tokenState.accessToken && tokenState.expiresAt > Date.now() + TOKEN_EARLY_REFRESH_MS) return tokenState.accessToken;
  if (!tokenFlight) {
    tokenFlight = loginOrRefresh().finally(() => { tokenFlight = null; });
  }
  return tokenFlight;
}

async function upstreamCall(body, method, path, payload, { write = false } = {}) {
  const settings = config();
  let token;
  try {
    token = await accessToken();
  } catch (error) {
    log('vinlink_auth_failed', { message: error.message });
    return invalid('VINLINK_AUTH_FAILED', error.message, 'Dạ hệ thống đặt xe đang chưa kết nối được, anh/chị vui lòng thử lại sau ít phút ạ.');
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Channel': 'VOICE',
    'X-Trace-Id': traceId(body),
    'X-Request-Id': requestId(body),
  };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (write) headers['Idempotency-Key'] = idempotencyKey(body);
  try {
    const { response, body: upstream } = await fetchJson(`${settings.baseUrl}${path}`, {
      method, headers, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    }, settings.timeoutMs);
    if (!response.ok || upstream?.success === false) {
      const code = text(upstream?.error?.code || upstream?.error_code) || `UPSTREAM_HTTP_${response.status}`;
      log('vinlink_upstream_rejected', {
        method,
        path,
        status: response.status,
        code,
        traceId: text(upstream?.traceId) || null,
        validation: validationDetails(upstream),
      });
      return invalid(code, text(upstream?.error?.message || upstream?.message) || `Upstream HTTP ${response.status}`, 'Dạ hệ thống đặt xe chưa xử lý được yêu cầu này. Anh/chị vui lòng thử lại sau ít phút ạ.');
    }
    return { success: true, data: upstream?.data, traceId: text(upstream?.traceId) };
  } catch (error) {
    const code = error?.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE';
    log('vinlink_upstream_failed', { method, path, code, message: error.message });
    return invalid(code, error.message, 'Dạ hệ thống đặt xe đang bận nên em chưa thể kiểm tra ngay. Anh/chị vui lòng thử lại sau ít phút ạ.');
  }
}

function mockPlaceFromRef(ref) {
  const found = demoPlaces.find((item) => item.placeId === ref?.placeId);
  if (found) return found;
  return {
    placeId: text(ref?.placeId) || `mock_${randomUUID().slice(0, 8)}`,
    name: text(ref?.address) || 'Điểm đã chọn',
    address: text(ref?.address) || 'Điểm đã chọn',
    lat: number(ref?.lat) ?? 10.7769,
    lng: number(ref?.lng) ?? 106.7009,
  };
}

function mockFare(serviceId, pickup, dropoffs) {
  const seed = text(pickup?.address || pickup?.placeId).length + text(dropoffs?.[0]?.address || dropoffs?.[0]?.placeId).length;
  return 85000 + (Number(serviceId) % 10) * 5000 + Math.min(seed * 1000, 45000);
}

function mockSearch(payload) {
  const query = text(payload.query).toLocaleLowerCase('vi');
  const items = demoPlaces.filter((place) => `${place.name} ${place.address}`.toLocaleLowerCase('vi').includes(query));
  return { success: true, data: { items: items.length ? items : demoPlaces.slice(0, 3) } };
}

function mockQuote(payload) {
  const quoteId = `mq_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const amount = mockFare(payload.serviceId, payload.pickup, payload.dropoffs);
  const quote = {
    quoteId,
    serviceId: payload.serviceId,
    pickup: mockPlaceFromRef(payload.pickup),
    dropoffs: payload.dropoffs.map(mockPlaceFromRef),
    distanceMeters: 6500,
    durationSeconds: 1200,
    fare: { amount, currency: 'VND' },
    fareBreakdown: { base: { amount: amount - 8000, currency: 'VND' }, surcharge: { amount: 0, currency: 'VND' }, platformFee: { amount: 0, currency: 'VND' }, insuranceFee: { amount: 0, currency: 'VND' }, vat: { amount: 8000, currency: 'VND' } },
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  mockQuotes.set(quoteId, quote);
  return { success: true, data: quote };
}

function mockCreateBooking(payload) {
  const quote = payload.quoteId ? mockQuotes.get(payload.quoteId) : null;
  if (payload.quoteId && !quote) return invalid('QUOTE_NOT_FOUND', 'quoteId was not found', 'Dạ báo giá này đã không còn hiệu lực. Em xin phép kiểm tra lại giá cho anh/chị ạ.');
  const bookingId = `MB${Date.now().toString().slice(-8)}`;
  const booking = {
    bookingId,
    status: 'FINDING_DRIVER',
    serviceId: payload.serviceId || quote?.serviceId,
    serviceName: 'Dịch vụ lái xe',
    pickup: quote?.pickup || mockPlaceFromRef(payload.pickup),
    dropoffs: quote?.dropoffs || (payload.dropoffs || []).map(mockPlaceFromRef),
    fare: quote?.fare || { amount: 0, currency: 'VND' },
    fareBreakdown: quote?.fareBreakdown || {},
    paymentMethod: payload.paymentMethod || null,
    paymentStatus: 'PENDING',
    createdAt: new Date().toISOString(),
    pickupTime: payload.pickupTime || 'NOW',
    customerPhone: payload.customerPhone,
  };
  mockBookings.set(bookingId, booking);
  return { success: true, data: booking };
}

function mockCurrentBooking(customerPhone) {
  const phone = safePhone(customerPhone);
  const bookings = [...mockBookings.values()].filter((booking) => (
    !['CANCELLED', 'COMPLETED'].includes(booking.status)
    && safePhone(booking.customerPhone) === phone
  ));
  const booking = bookings.at(-1);
  if (!booking) return invalid('BOOKING_NOT_FOUND', 'active booking was not found', 'Dạ hiện em chưa tìm thấy chuyến nào đang hoạt động theo số điện thoại này ạ.');
  return { success: true, data: booking };
}

function mockBookingDetail(bookingId, owner) {
  const booking = mockBookings.get(bookingId);
  if (!booking) return invalid('BOOKING_NOT_FOUND', 'bookingId was not found', 'Dạ em chưa tìm thấy chuyến phù hợp để kiểm tra cho anh/chị ạ.');
  // The public API verifies booking ownership. Require a matching phone in mock
  // mode too, so an integration test cannot accidentally pass with another
  // customer's booking ID.
  if (!owner?.customerPhone || safePhone(booking.customerPhone) !== safePhone(owner.customerPhone)) {
    return invalid('PERMISSION_DENIED', 'booking does not belong to the supplied customer', 'Dạ em chưa thể xác minh chuyến này thuộc số điện thoại anh/chị cung cấp ạ.');
  }
  return { success: true, data: booking };
}

function result(data, userMessageVi, trace = '') {
  return { success: true, result: data ?? null, user_message_vi: userMessageVi, ...(trace ? { trace_id: trace } : {}) };
}

function resultSummary(data) {
  return {
    bookingId: text(data?.bookingId) || null,
    quoteId: text(data?.quoteId) || null,
    status: text(data?.status) || null,
    itemCount: Array.isArray(data?.items) ? data.items.length : undefined,
  };
}

function quoteMessage(quote) {
  const amount = Number(quote?.fare?.amount || 0).toLocaleString('vi-VN');
  return `Dạ, giá dự kiến cho hành trình này là ${amount} đồng. Anh/chị xác nhận thông tin đặt xe để em tạo yêu cầu nhé.`;
}

function validateEnvelope(body, expectedTool) {
  const input = argumentsFrom(body);
  if (!input) return { error: invalid('INVALID_WEBHOOK_ENVELOPE', 'arguments object is required', 'Dạ em chưa nhận được thông tin hợp lệ để xử lý ạ.') };
  if (text(body?.tool_name) && text(body.tool_name) !== expectedTool) {
    return { error: invalid('TOOL_NAME_MISMATCH', `expected ${expectedTool}`, 'Dạ hệ thống đang nhận sai yêu cầu xử lý, anh/chị vui lòng thử lại ạ.') };
  }
  return { input };
}

async function execute(body, expectedTool, build, mockHandler, message, options = {}) {
  const invocation = idempotencyKey(body);
  const checked = validateEnvelope(body, expectedTool);
  if (checked.error) {
    log('vinlink_tool_failed', { toolName: expectedTool, invocationId: invocation, stage: 'envelope', errorCode: checked.error.error_code });
    return checked.error;
  }
  const payload = build(checked.input);
  if (payload.error) {
    log('vinlink_tool_failed', { toolName: expectedTool, invocationId: invocation, stage: 'validation', errorCode: payload.error.error_code });
    return payload.error;
  }
  const settings = config();
  const cacheKey = `${expectedTool}:${invocation}`;
  if (options.write && completedInvocations.has(cacheKey)) {
    const cached = completedInvocations.get(cacheKey);
    log('vinlink_tool_succeeded', { toolName: expectedTool, invocationId: invocation, mode: settings.mode, duplicate: true, ...resultSummary(cached.result) });
    return cached;
  }
  log('vinlink_tool_called', { toolName: expectedTool, invocationId: invocation, mode: settings.mode, phone: maskPhone(payload.customerPhone) });
  const upstreamPath = options.path?.includes('{') ? upstreamPathFor(expectedTool, payload) : options.path;
  const outboundPayload = typeof options.upstreamPayload === 'function'
    ? options.upstreamPayload(payload)
    : payload;
  const upstream = settings.mode === 'mock'
    ? mockHandler(payload)
    : await upstreamCall(
      body,
      options.method || 'POST',
      upstreamPath,
      options.method === 'GET' ? undefined : outboundPayload,
      { write: Boolean(options.write) },
    );
  if (upstream.success === false) {
    log('vinlink_tool_failed', { toolName: expectedTool, invocationId: invocation, mode: settings.mode, stage: 'provider', errorCode: upstream.error_code });
    return upstream;
  }
  const final = result(upstream.data, message(upstream.data), upstream.traceId);
  if (options.write) completedInvocations.set(cacheKey, final);
  log('vinlink_tool_succeeded', { toolName: expectedTool, invocationId: invocation, mode: settings.mode, duplicate: false, ...resultSummary(final.result) });
  return final;
}

export function searchPlaces(body) {
  return execute(body, 'vinlink_search_places', (input) => {
    const query = text(read(input, 'query'));
    if (query.trim().length < 10) return { error: invalid('VALIDATION_ERROR', 'query must contain at least 10 characters', 'Dạ anh/chị cho em xin địa điểm cần tìm rõ hơn một chút ạ.') };
    const nearLat = number(read(input, 'near_lat', 'nearLat'));
    const nearLng = number(read(input, 'near_lng', 'nearLng'));
    return { query, ...(nearLat !== null && nearLng !== null ? { near: { lat: nearLat, lng: nearLng } } : {}) };
  }, mockSearch, (data) => `Dạ, em đã tìm thấy ${data?.items?.length || 0} địa điểm phù hợp để anh/chị chọn ạ.`, { path: '/api/v1/assistant/places/search' });
}

export function getServices(body) {
  return execute(
    body,
    'vinlink_get_services',
    () => ({}),
    () => ({ success: true, data: demoServices }),
    (data) => `Dạ, hệ thống hiện có ${Array.isArray(data) ? data.length : 0} dịch vụ đang hoạt động ạ.`,
    { method: 'GET', path: '/api/v1/assistant/services' },
  );
}

export function reversePlace(body) {
  return execute(body, 'vinlink_reverse_place', (input) => {
    const lat = number(read(input, 'lat'));
    const lng = number(read(input, 'lng'));
    if (lat === null || lng === null) return { error: invalid('VALIDATION_ERROR', 'lat and lng are required', 'Dạ em chưa xác định được vị trí. Anh/chị cho em xin địa chỉ điểm đón nhé.') };
    return { lat, lng };
  }, (payload) => ({ success: true, data: mockPlaceFromRef(payload) }), (data) => `Dạ, em đã xác định vị trí tại ${text(data?.address) || 'địa điểm này'} ạ.`, { path: '/api/v1/assistant/places/reverse' });
}

export function getQuote(body) {
  return execute(body, 'vinlink_get_quote', (input) => {
    const serviceId = number(read(input, 'service_id', 'serviceId')) || config().defaultServiceId;
    const pickup = placeRef(input, 'pickup');
    const destination = placeRef(input, 'destination');
    const pickupTime = text(read(input, 'pickup_time', 'pickupTime')) || 'NOW';
    if (!Number.isInteger(serviceId) || serviceId <= 0 || !pickup || !destination) {
      return { error: invalid('VALIDATION_ERROR', 'service_id, pickup and destination are required', 'Dạ anh/chị cho em xin loại dịch vụ, điểm đón và điểm đến để kiểm tra giá ạ.') };
    }
    return { serviceId, pickup, dropoffs: [destination], pickupTime };
  }, mockQuote, quoteMessage, { path: '/api/v1/assistant/quotes', write: true });
}

export function createBooking(body) {
  return execute(body, 'vinlink_create_booking', (input) => {
    const customerPhone = safePhone(read(input, 'customer_phone', 'customerPhone', 'phone'));
    const customerName = text(read(input, 'customer_name', 'customerName'));
    const bookingMode = text(read(input, 'booking_mode', 'bookingMode')).toUpperCase();
    const quoteId = text(read(input, 'quote_id', 'quoteId'));
    const serviceId = number(read(input, 'service_id', 'serviceId'));
    const pickupPlaceId = text(read(input, 'pickup_place_id', 'pickupPlaceId'));
    const confirmedFields = Array.isArray(input.confirmed_fields) ? input.confirmed_fields : [];
    const required = ['customer_phone', 'customer_name', 'booking_mode', 'confirmed_summary'];
    const confirmed = input.confirmed === true || required.every((field) => confirmedFields.includes(field));
    if (!customerPhone || !customerName || !['QUOTED', 'PICKUP_ONLY'].includes(bookingMode)) return { error: invalid('VALIDATION_ERROR', 'customer and booking_mode are required', 'Dạ em chưa đủ tên, số điện thoại hoặc loại yêu cầu đặt chuyến để xử lý ạ.') };
    if (!confirmed) return { error: invalid('CONFIRMATION_REQUIRED', 'confirmed_fields is incomplete', 'Dạ anh/chị xác nhận lại thông tin đặt xe giúp em trước khi tạo yêu cầu nhé.') };
    if (bookingMode === 'QUOTED') {
      if (!quoteId) return { error: invalid('QUOTE_REQUIRED', 'quote_id is required for QUOTED booking', 'Dạ em cần kiểm tra giá hành trình trước khi tạo yêu cầu đặt xe cho anh/chị ạ.') };
      return { customerPhone, customerName, quoteId, confirmed: true };
    }
    if (!Number.isInteger(serviceId) || serviceId <= 0 || !pickupPlaceId) return { error: invalid('VALIDATION_ERROR', 'service_id and pickup_place_id are required for PICKUP_ONLY booking', 'Dạ em cần xác định đúng dịch vụ và điểm đón trước khi tạo chuyến cho anh/chị ạ.') };
    return { customerPhone, customerName, serviceId, pickup: { placeId: pickupPlaceId }, confirmed: true };
  }, mockCreateBooking, (data) => {
    const pickupAddress = text(data?.pickup?.address) || 'điểm đón đã xác nhận';
    const destinationAddress = text(data?.dropoffs?.[0]?.address);
    return destinationAddress
      ? `Dạ, em đã ghi nhận yêu cầu đặt xe từ ${pickupAddress} đến ${destinationAddress}. Hệ thống đang tìm tài xế cho anh/chị ạ.`
      : `Dạ, em đã ghi nhận yêu cầu đón tại ${pickupAddress}. Chuyến hiện chưa có điểm trả và chưa có giá ạ.`;
  }, { path: '/api/v1/assistant/bookings', write: true });
}

export function getCurrentBooking(body) {
  return execute(body, 'vinlink_get_current_booking', (input) => {
    const customerPhone = safePhone(read(input, 'customer_phone', 'customerPhone', 'phone'));
    if (!customerPhone) return { error: invalid('VALIDATION_ERROR', 'customer_phone is required', 'Dạ em cần số điện thoại đã dùng đặt xe để kiểm tra chuyến đang hoạt động ạ.') };
    return { customerPhone };
  }, (payload) => mockCurrentBooking(payload.customerPhone), () => 'Dạ, em đã tìm thấy chuyến đang hoạt động của anh/chị ạ.', { method: 'GET', path: '/api/v1/assistant/bookings/current?customerPhone={customerPhone}' });
}

export function getBooking(body) {
  return execute(body, 'vinlink_get_booking', (input) => {
    const bookingId = text(read(input, 'booking_id', 'bookingId'));
    const owner = customer(input);
    if (!bookingId || !owner) return { error: invalid('VALIDATION_ERROR', 'booking_id and customer id or phone are required', 'Dạ anh/chị cho em xin mã chuyến và số điện thoại đã dùng để đặt xe để em kiểm tra nhé.') };
    return { bookingId, owner };
  }, (payload) => mockBookingDetail(payload.bookingId, payload.owner), (data) => `Dạ, em đã tra cứu chuyến của anh/chị. Trạng thái hiện tại là ${text(data?.status) || 'đang được cập nhật'} ạ.`, { method: 'GET', path: '/api/v1/assistant/bookings/{bookingId}' });
}

export function cancelBooking(body) {
  return execute(body, 'vinlink_cancel_booking', (input) => {
    const bookingId = text(read(input, 'booking_id', 'bookingId'));
    const owner = customer(input);
    const reason = text(read(input, 'reason'));
    const confirmed = input.confirmed === true || (Array.isArray(input.confirmed_fields) && input.confirmed_fields.includes('booking_id') && input.confirmed_fields.includes('reason'));
    if (!bookingId || !owner || !reason) return { error: invalid('VALIDATION_ERROR', 'booking_id, customer and reason are required', 'Dạ anh/chị cho em xin mã chuyến, số điện thoại đặt xe và lý do hủy để em hỗ trợ ạ.') };
    if (!confirmed) return { error: invalid('CONFIRMATION_REQUIRED', 'cancellation needs confirmation', 'Dạ anh/chị xác nhận hủy chuyến này giúp em nhé.') };
    return { bookingId, customer: owner, reason };
  }, (payload) => {
    const found = mockBookingDetail(payload.bookingId, payload.customer);
    if (!found.success) return found;
    found.data.status = 'CANCELLED';
    return found;
  }, () => 'Dạ, yêu cầu hủy chuyến của anh/chị đã được hệ thống ghi nhận ạ.', {
    path: '/api/v1/assistant/bookings/{bookingId}/cancel',
    write: true,
    upstreamPayload: (payload) => ({ customer: payload.customer, reason: payload.reason }),
  });
}

export function repriceBooking(body) {
  return execute(body, 'vinlink_reprice_booking', (input) => {
    const bookingId = text(read(input, 'booking_id', 'bookingId'));
    const owner = customer(input);
    const quoteId = text(read(input, 'quote_id', 'quoteId'));
    if (!bookingId || !owner || !quoteId) return { error: invalid('VALIDATION_ERROR', 'booking_id, customer and quote_id are required', 'Dạ em cần mã chuyến, thông tin xác thực và báo giá mới để cập nhật giá ạ.') };
    return { bookingId, customer: owner, quoteId };
  }, (payload) => {
    const found = mockBookingDetail(payload.bookingId, payload.customer);
    const quote = mockQuotes.get(payload.quoteId);
    if (!found.success) return found;
    if (!quote) return invalid('QUOTE_NOT_FOUND', 'quoteId was not found', 'Dạ báo giá mới không còn hiệu lực. Em xin phép kiểm tra lại cho anh/chị ạ.');
    found.data.fare = quote.fare;
    found.data.fareBreakdown = quote.fareBreakdown;
    return found;
  }, (data) => `Dạ, em đã cập nhật giá dự kiến là ${Number(data?.fare?.amount || 0).toLocaleString('vi-VN')} đồng ạ.`, { path: '/api/v1/assistant/bookings/{bookingId}/reprice', write: true });
}

// Route handlers need actual URL values for paths containing path/query variables.
export function upstreamPathFor(toolName, payload) {
  if (toolName === 'vinlink_get_current_booking') return `/api/v1/assistant/bookings/current?customerPhone=${encodeURIComponent(payload.customerPhone)}`;
  if (toolName === 'vinlink_get_booking') {
    const query = payload.owner.customerId ? `customerId=${payload.owner.customerId}` : `customerPhone=${encodeURIComponent(payload.owner.customerPhone)}`;
    return `/api/v1/assistant/bookings/${encodeURIComponent(payload.bookingId)}?${query}`;
  }
  if (toolName === 'vinlink_cancel_booking') return `/api/v1/assistant/bookings/${encodeURIComponent(payload.bookingId)}/cancel`;
  if (toolName === 'vinlink_reprice_booking') return `/api/v1/assistant/bookings/${encodeURIComponent(payload.bookingId)}/reprice`;
  return '';
}
