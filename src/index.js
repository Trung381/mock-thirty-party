import express from 'express';
import morgan from 'morgan';
import { routeAuth } from './config.js';
import { assertDbReady, ensureSchema, query } from './db.js';
import { requireAuth } from './auth.js';
import { lookupBill } from './lookupBill.js';
import { initContext } from './contextInit.js';
import { createTrip, getTripById, lookupLatestTrip, lookupTrip } from './trips.js';
import {
  listCallbacks,
  listDemoSchedules,
  listLeadOutcomes,
  reportLeadOutcome,
  scheduleCallback,
  scheduleDemo,
} from './healthLeads.js';
import {
  checkVisaRequirements,
  getCustomerProfile,
  getPackageQuote,
  holdBooking,
  scheduleConsultant,
} from './auroraTravel.js';
import {
  clearCallCompletedWebhooks,
  listCallCompletedWebhooks,
  receiveCallCompletedWebhook,
} from './callyticsWebhooks.js';
import { createExternalOrder, listExternalOrders } from './externalOrders.js';
import { compactCode, compactPhone } from './text.js';

const app = express();
const port = Number(process.env.PORT || 38080);

app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));

app.get('/health', requireAuth('/health'), async (_req, res) => {
  try {
    await assertDbReady();
    res.json({ status: 'healthy', ready: true });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', ready: false, error: String(error.message || error) });
  }
});

app.get('/routes', requireAuth('/routes'), (_req, res) => {
  res.json({ routes: routeAuth });
});

app.post('/context/init', requireAuth('/context/init'), async (req, res, next) => {
  try {
    res.json(await initContext(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/lookup-bill', requireAuth('/lookup-bill'), async (req, res, next) => {
  try {
    res.json(await lookupBill(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/secure/lookup-bill', requireAuth('/secure/lookup-bill'), async (req, res, next) => {
  try {
    res.json(await lookupBill(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/apikey/lookup-bill', requireAuth('/apikey/lookup-bill'), async (req, res, next) => {
  try {
    res.json(await lookupBill(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/trips', requireAuth('/trips'), async (req, res, next) => {
  try {
    res.json(await createTrip(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/secure/trips', requireAuth('/secure/trips'), async (req, res, next) => {
  try {
    res.json(await createTrip(req.body));
  } catch (error) {
    next(error);
  }
});

// Taixe247's inbound-agent contract. These endpoints deliberately reuse the
// shared trip store, so a booking created here can also be found via /lookup-trip.
app.post('/taixe247/bookings', requireAuth('/taixe247/bookings'), async (req, res, next) => {
  try {
    res.json(await createTrip(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/taixe247/bookings/lookup', requireAuth('/taixe247/bookings/lookup'), async (req, res, next) => {
  try {
    res.json(await lookupLatestTrip(req.body));
  } catch (error) {
    next(error);
  }
});

app.get('/trips/:trip_id', requireAuth('/trips/:trip_id'), async (req, res, next) => {
  try {
    res.json(await getTripById(req.params.trip_id));
  } catch (error) {
    next(error);
  }
});

app.post('/lookup-trip', requireAuth('/lookup-trip'), async (req, res, next) => {
  try {
    res.json(await lookupTrip(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/api/external-orders', requireAuth('/api/external-orders'), async (req, res, next) => {
  try {
    const result = await createExternalOrder(req.body);
    const isNewOrder = result.success && result.result?.duplicate === false;
    res.status(isNewOrder ? 201 : 200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/external-orders', requireAuth('/api/external-orders'), async (_req, res, next) => {
  try {
    res.json(await listExternalOrders());
  } catch (error) {
    next(error);
  }
});

app.post('/health/schedule-demo', requireAuth('/health/schedule-demo'), async (req, res, next) => {
  try {
    res.json(await scheduleDemo(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/health/schedule-callback', requireAuth('/health/schedule-callback'), async (req, res, next) => {
  try {
    res.json(await scheduleCallback(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/health/report-lead-outcome', requireAuth('/health/report-lead-outcome'), async (req, res, next) => {
  try {
    res.json(await reportLeadOutcome(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/travel/customer-profile', requireAuth('/travel/customer-profile'), async (req, res, next) => {
  try {
    res.json(await getCustomerProfile(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/travel/package-quote', requireAuth('/travel/package-quote'), async (req, res, next) => {
  try {
    res.json(await getPackageQuote(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/travel/visa-check', requireAuth('/travel/visa-check'), async (req, res, next) => {
  try {
    res.json(await checkVisaRequirements(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/travel/booking-hold', requireAuth('/travel/booking-hold'), async (req, res, next) => {
  try {
    res.json(await holdBooking(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/travel/schedule-consultant', requireAuth('/travel/schedule-consultant'), async (req, res, next) => {
  try {
    res.json(await scheduleConsultant(req.body));
  } catch (error) {
    next(error);
  }
});

app.get('/health/demo-schedules', requireAuth('/health/demo-schedules'), async (_req, res, next) => {
  try {
    res.json(await listDemoSchedules());
  } catch (error) {
    next(error);
  }
});

app.get('/health/callbacks', requireAuth('/health/callbacks'), async (_req, res, next) => {
  try {
    res.json(await listCallbacks());
  } catch (error) {
    next(error);
  }
});

app.get('/health/lead-outcomes', requireAuth('/health/lead-outcomes'), async (_req, res, next) => {
  try {
    res.json(await listLeadOutcomes());
  } catch (error) {
    next(error);
  }
});

app.post('/webhooks/callytics/call-completed', requireAuth('/webhooks/callytics/call-completed'), async (req, res, next) => {
  try {
    res.status(202).json(await receiveCallCompletedWebhook(req.headers, req.body));
  } catch (error) {
    next(error);
  }
});

app.get('/webhooks/callytics/call-completed', requireAuth('/webhooks/callytics/call-completed'), async (_req, res, next) => {
  try {
    res.json(await listCallCompletedWebhooks());
  } catch (error) {
    next(error);
  }
});

app.delete('/webhooks/callytics/call-completed', requireAuth('/webhooks/callytics/call-completed'), async (_req, res, next) => {
  try {
    res.json(await clearCallCompletedWebhooks());
  } catch (error) {
    next(error);
  }
});

app.get('/admin/customers', requireAuth('/admin/customers'), async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT c.*, COALESCE(json_agg(b ORDER BY b.created_at DESC) FILTER (WHERE b.id IS NOT NULL), '[]') AS bills
      FROM evn_customers c
      LEFT JOIN evn_bills b ON b.customer_id = c.id
      GROUP BY c.id
      ORDER BY c.id ASC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

app.post('/admin/customers', requireAuth('/admin/customers'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const code = compactCode(body.customer_code);
    const phone = compactPhone(body.phone);
    if (!code || !body.customer_name || !phone) {
      return res.status(400).json({
        success: false,
        error_code: 'invalid_customer',
        error_message: 'customer_code, customer_name and phone are required',
      });
    }

    const { rows } = await query(
      `
        INSERT INTO evn_customers (customer_code, customer_name, phone, region, address, metadata)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT (customer_code) DO UPDATE
        SET customer_name = EXCLUDED.customer_name,
            phone = EXCLUDED.phone,
            region = EXCLUDED.region,
            address = EXCLUDED.address,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        RETURNING *
      `,
      [
        code,
        String(body.customer_name).trim(),
        phone,
        String(body.region || 'EVN').trim(),
        String(body.address || '').trim(),
        JSON.stringify(body.metadata || {}),
      ],
    );
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
});

app.delete('/admin/customers/:id', requireAuth('/admin/customers/:id'), async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM evn_customers WHERE id = $1', [Number(req.params.id)]);
    res.json({ success: true, deleted: rowCount });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    success: false,
    error_code: 'internal_error',
    error_message: String(error.message || error),
  });
});

ensureSchema()
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`mock-third-party listening on :${port}`);
    });
  })
  .catch((error) => {
    console.error('failed to initialize schema', error);
    process.exit(1);
  });
