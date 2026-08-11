# Mock Third Party

Standalone third-party mock API for Callbot tool testing. It is intentionally
separate from `callbot` and `callytics`.

## Run

```bash
cd /home/trung/Documents/startup/mock-third-party
docker compose up -d --build
```

API:

```text
http://127.0.0.1:38080
```

Postgres:

```text
postgres://mock_tools:mock_tools@127.0.0.1:35432/mock_tools
```

## Auth

Route auth is configured in `config/routes.json`.

Supported modes:

- `none`
- `bearer`
- `api_key`

Bearer token:

```bash
AUTH_BEARER_TOKEN='mock-tool-token' docker compose up -d --build
```

API key:

```bash
AUTH_API_KEY='mock-tool-api-key' docker compose up -d --build
```

You can override the full route auth map with `ROUTE_AUTH_CONFIG_JSON`.

## Lookup Bill Tool

No-auth endpoint:

```bash
curl -sS -X POST http://127.0.0.1:38080/lookup-bill \
  -H 'Content-Type: application/json' \
  --data '{"arguments":{"customer_code":"P0102458","confirmed_fields":["customer_code"]}}'
```

Bearer endpoint:

```bash
curl -sS -X POST http://127.0.0.1:38080/secure/lookup-bill \
  -H 'Authorization: Bearer mock-tool-token' \
  -H 'Content-Type: application/json' \
  --data '{"arguments":{"customer_code":"P0102458","phone":"0342387314","customer_name":"trung","confirmed_fields":["customer_code","phone","customer_name"]}}'
```

API-key endpoint:

```bash
curl -sS -X POST http://127.0.0.1:38080/apikey/lookup-bill \
  -H 'x-api-key: mock-tool-api-key' \
  -H 'Content-Type: application/json' \
  --data '{"arguments":{"customer_code":"PD0102458","confirmed_fields":["customer_code"]}}'
```

Callbot tool endpoint for local tests:

```text
http://127.0.0.1:38080/lookup-bill
```

Callbot tool endpoint from another Tailscale machine:

```text
http://<this-machine-tailscale-ip>:38080/lookup-bill
```

## External Order Tool

This endpoint is a gateway for the An Việt demo. It accepts the standard
Callbot envelope, reads order fields from `arguments`, then forwards only the
provider body to `POST http://139.162.40.219:3000/api/external-orders`.
The upstream URL and timeout can be changed with `UPSTREAM_EXTERNAL_ORDERS_URL`
and `UPSTREAM_EXTERNAL_ORDERS_TIMEOUT_MS`.

### Gateway mapping

| Callbot gửi đến mock | Mock gửi đến An Việt |
| --- | --- |
| `body.arguments.phone` | `phone` |
| `body.arguments.customername` | `customerName` |
| `body.arguments.deliverydate` | `deliveryDate` |
| `body.arguments.message` | `message` |
| `body.arguments.externalorderid` | `externalOrderId` (nếu có) |
| `body.arguments.source` | `source` |

`tool_name`, `session_id`, `tenant_id`, `correlation_id`, `invocation_id` và
`caller_number` không được gửi sang API An Việt vì API này chỉ nhận body đơn
giản. Response đơn hàng của An Việt được đặt vào `result`; mock thêm
`success: true` và `user_message_vi` để Callbot đọc cho khách.

Create an order:

```bash
curl -sS -X POST http://127.0.0.1:38080/api/external-orders \
  -H 'Content-Type: application/json' \
  --data '{
    "tool_name": "create_external_order",
    "arguments": {
      "phone": "0901234533",
      "customername": "Trần Thị Quế",
      "deliverydate": "2026-08-03",
      "message": "2kg thịt bò mềm, 10 miếng đậu phụ to",
      "externalorderid": "TEST-001",
      "source": "voice"
    },
    "session_id": "sess_123456",
    "tenant_id": "an-viet-demo",
    "correlation_id": "corr_123456",
    "invocation_id": "invoke_123456",
    "caller_number": "0901234533"
  }'
```

The gateway returns the standardized Callbot response: `success`, `result`
and `user_message_vi`. `result` contains the order response returned by An
Việt. Idempotency remains the responsibility of An Việt because it creates
the actual order.

## Context Init

This endpoint is intended for Callytics `/runtime/resolve` to fetch partner
business context before Callbot starts.

```bash
curl -sS -X POST http://127.0.0.1:38080/context/init \
  -H 'Content-Type: application/json' \
  --data '{"session_id":"s1","direction":"inbound","phone":"0342387314","caller_number":"0342387314","callee_number":"1558","bot_id":"bot1","tenant_id":"evn"}'
```

The response has a stable envelope and flexible business content:

```json
{
  "success": true,
  "identified": true,
  "match_status": "exact",
  "metadata": {
    "identified": true,
    "customer_name": "anh Trung"
  },
  "agent_context": {
    "customer": {},
    "recent_trips": [],
    "business_summary": ""
  }
}
```

## Trip Tools

### Taixe247 inbound-agent tools

The `taixe247-inbound-web-session` fixture uses these no-auth endpoints. They
accept either the tool arguments directly or an `{ "arguments": { ... } }`
envelope. Created bookings share the same in-memory API model and database as
the generic trip endpoints below.

Create a booking:

```bash
curl -sS -X POST http://127.0.0.1:38080/taixe247/bookings \
  -H 'Content-Type: application/json' \
  --data '{"phone":"0342387314","pickup_address":"Cầu Giấy","destination_address":"Hà Đông","pickup_time":"đi ngay","car_type":"lái hộ ô tô","confirmed_fields":["phone","pickup_address","destination_address","pickup_time","car_type"]}'
```

Look up a booking by phone or `trip_id`. A phone lookup returns only that
customer's most recently created booking:

```bash
curl -sS -X POST http://127.0.0.1:38080/taixe247/bookings/lookup \
  -H 'Content-Type: application/json' \
  --data '{"phone":"0342387314","confirmed_fields":["phone"]}'
```

Create a trip:

```bash
curl -sS -X POST http://127.0.0.1:38080/trips \
  -H 'Content-Type: application/json' \
  --data '{"arguments":{"phone":"0342387314","pickup_address":"Hoan Kiem","destination_address":"Noi Bai","confirmed_fields":["phone","pickup_address","destination_address"]}}'
```

Lookup trips:

```bash
curl -sS -X POST http://127.0.0.1:38080/lookup-trip \
  -H 'Content-Type: application/json' \
  --data '{"arguments":{"phone":"0342387314"}}'
```

Lookup by trip ID:

```bash
curl -sS http://127.0.0.1:38080/trips/TRIP_ID
```

## Health Outbound Tools

Schedule a health demo:

```bash
curl -sS -X POST http://127.0.0.1:38080/health/schedule-demo \
  -H 'Content-Type: application/json' \
  --data '{"arguments":{"contact_phone":"0342387314","pain_point":"nhắc hẹn","demo_time":"chiều mai 3 giờ","confirmed_fields":["contact_phone","pain_point","demo_time"]}}'
```

Schedule a callback:

```bash
curl -sS -X POST http://127.0.0.1:38080/health/schedule-callback \
  -H 'Content-Type: application/json' \
  --data '{"arguments":{"contact_phone":"0342387314","callback_time":"10 giờ sáng mai","confirmed_fields":["contact_phone","callback_time"]}}'
```

Report a lead outcome:

```bash
curl -sS -X POST http://127.0.0.1:38080/health/report-lead-outcome \
  -H 'Content-Type: application/json' \
  --data '{"arguments":{"lead_status":"not_interested","contact_phone":"0342387314","summary":"Khách chưa có nhu cầu."}}'
```

## Admin

```bash
curl -sS http://127.0.0.1:38080/admin/customers \
  -H 'Authorization: Bearer mock-tool-token'
```

Create/update customer:

```bash
curl -sS -X POST http://127.0.0.1:38080/admin/customers \
  -H 'Authorization: Bearer mock-tool-token' \
  -H 'Content-Type: application/json' \
  --data '{"customer_code":"PD9999999","customer_name":"Nguyen Van A","phone":"0349999999","region":"EVNHANOI"}'
```
