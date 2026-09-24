const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// In-memory store for OTPs during runtime
const otpStore = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// Helper to parse JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const [reqPath, queryString] = req.url.split('?');

  // ============================================================
  // BACKEND API ROUTES
  // ============================================================

  // 1. Send Phone OTP
  if (req.method === 'POST' && reqPath === '/api/send-otp') {
    try {
      const { phone } = await parseJsonBody(req);
      const cleanPhone = (phone || '').replace(/\D/g, '');
      const otp = '123456'; // Default sandbox OTP, can be randomized

      otpStore.set(cleanPhone, { otp, expiresAt: Date.now() + 300000 });

      console.log(`[SMS Gateway] 📲 Sent OTP to +91 ${cleanPhone}: ${otp}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'OTP sent to mobile number',
        sandboxOtpHint: '123456'
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 2. Verify Phone OTP
  if (req.method === 'POST' && reqPath === '/api/verify-otp') {
    try {
      const { phone, otp } = await parseJsonBody(req);
      const cleanPhone = (phone || '').replace(/\D/g, '');
      const record = otpStore.get(cleanPhone);

      const isValid = otp === '123456' || (record && record.otp === otp && Date.now() < record.expiresAt);

      if (isValid) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          token: 'hs_sess_' + Buffer.from(cleanPhone + '_' + Date.now()).toString('base64'),
          phone: cleanPhone
        }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid or expired OTP code. Use 123456 for testing.' }));
      }
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

function getCashfreeConfig() {
  const appId = process.env.CASHFREE_APP_ID || 
                process.env.CASHFREE_CLIENT_ID || 
                process.env.APP_ID || 
                process.env.cashfree_app_id || 
                process.env.CF_APP_ID || '';

  const secretKey = process.env.CASHFREE_SECRET_KEY || 
                    process.env.CASHFREE_CLIENT_SECRET || 
                    process.env.SECRET_KEY || 
                    process.env.cashfree_secret_key || 
                    process.env.CF_SECRET_KEY || '';

  let env = (process.env.CASHFREE_ENV || process.env.cashfree_env || 'PRODUCTION').toUpperCase();
  if (secretKey.startsWith('cfsk_ma_prod_')) {
    env = 'PRODUCTION';
  }

  return { appId: appId.trim(), secretKey: secretKey.trim(), env };
}

  // Gateway Diagnostic Route
  if (req.method === 'GET' && reqPath === '/api/gateway-status') {
    const rawAppId = (process.env.CASHFREE_APP_ID || '').trim();
    const rawSecret = (process.env.CASHFREE_SECRET_KEY || '').trim();
    const rawEnv = (process.env.CASHFREE_ENV || '').trim();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      appIdLength: rawAppId.length,
      appIdPreview: rawAppId ? (rawAppId.slice(0, 4) + '***' + rawAppId.slice(-4)) : null,
      secretLength: rawSecret.length,
      secretPreview: rawSecret ? (rawSecret.slice(0, 10) + '***' + rawSecret.slice(-4)) : null,
      envVal: rawEnv
    }));
    return;
  }

  // 3. Create Cashfree PG Order
  if (req.method === 'POST' && reqPath === '/api/create-cashfree-order') {
    try {
      const { orderId, orderAmount, customerPhone, customerName } = await parseJsonBody(req);
      const cleanPhone = (customerPhone || '9999999999').replace(/\D/g, '').slice(-10);
      const { appId, secretKey, env } = getCashfreeConfig();

      console.log(`[Cashfree PG] Initiating order ${orderId} for ₹${orderAmount} (Customer: ${cleanPhone}) [${env}]`);

      // If live Cashfree credentials exist, call Cashfree API
      if (appId && secretKey && appId !== 'TEST_APP_ID') {
        const baseUrl = env === 'PRODUCTION' 
          ? 'https://api.cashfree.com/pg/orders' 
          : 'https://sandbox.cashfree.com/pg/orders';

        const cfRes = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': appId,
            'x-client-secret': secretKey,
            'x-api-version': '2023-08-01'
          },
          body: JSON.stringify({
            order_id: String(orderId),
            order_amount: Number(orderAmount),
            order_currency: 'INR',
            customer_details: {
              customer_id: 'cust_' + cleanPhone,
              customer_phone: cleanPhone,
              customer_name: customerName || 'Honesty Customer'
            },
            order_meta: {
              return_url: `${req.headers.origin || 'http://localhost:3000'}?order_id={order_id}`
            }
          })
        });

        const cfData = await cfRes.json();
        if (cfRes.ok && cfData.payment_session_id) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            orderId,
            orderAmount,
            paymentSessionId: cfData.payment_session_id,
            environment: env
          }));
          return;
        } else {
          console.warn('[Cashfree PG API Warning]:', cfData);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: cfData.message || 'Cashfree PG error',
            cfData,
            environment: env
          }));
          return;
        }
      }

      // Fallback: mock payment session for testing
      const paymentSessionId = 'session_' + Buffer.from(orderId + '_' + Date.now()).toString('base64');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        orderId,
        orderAmount,
        paymentSessionId,
        environment: env,
        isSimulated: true,
        reason: 'CASHFREE_APP_ID or CASHFREE_SECRET_KEY missing in server environment'
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 4. Cashfree Payment Webhook
  if (req.method === 'POST' && reqPath === '/api/cashfree-webhook') {
    try {
      const webhookData = await parseJsonBody(req);
      console.log('[Cashfree Webhook Received]:', webhookData);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ACKNOWLEDGED' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Webhook Error');
    }
    return;
  }

  // 4b. Confirm / Verify Cashfree Payment (Server-side check: GET /pg/orders/{order_id})
  if (req.method === 'POST' && reqPath === '/api/verify-cashfree-order') {
    try {
      const { orderId } = await parseJsonBody(req);
      const { appId, secretKey, env } = getCashfreeConfig();

      if (!orderId) {
        throw new Error('orderId is required');
      }

      if (appId && secretKey && appId !== 'TEST_APP_ID') {
        const baseUrl = env === 'PRODUCTION' 
          ? `https://api.cashfree.com/pg/orders/${orderId}` 
          : `https://sandbox.cashfree.com/pg/orders/${orderId}`;

        const cfRes = await fetch(baseUrl, {
          method: 'GET',
          headers: {
            'x-client-id': appId,
            'x-client-secret': secretKey,
            'x-api-version': '2023-08-01'
          }
        });

        const orderData = await cfRes.json();
        const isPaid = orderData.order_status === 'PAID';

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          isPaid,
          orderStatus: orderData.order_status,
          orderAmount: orderData.order_amount,
          cfOrderId: orderData.cf_order_id,
          orderData
        }));
        return;
      }

      // Simulated sandbox mode verification
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        isPaid: true,
        orderStatus: 'PAID',
        isSimulated: true
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 5. Test Supabase Connection
  if (req.method === 'POST' && reqPath === '/api/test-supabase') {
    try {
      const body = await parseJsonBody(req);
      const url = body.url || body.supabaseUrl || process.env.SUPABASE_URL;
      const anonKey = body.anonKey || body.supabaseAnonKey || process.env.SUPABASE_ANON_KEY;

      if (!url || !anonKey) {
        throw new Error('Supabase URL and Anon Key are required');
      }

      const cleanUrl = url.replace(/\/+$/, '');
      const testRes = await fetch(`${cleanUrl}/rest/v1/products?select=count`, {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        }
      });

      if (!testRes.ok) {
        const errText = await testRes.text();
        throw new Error(`Supabase returned HTTP ${testRes.status}: ${errText}`);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        ok: true,
        message: 'Successfully verified connection to Supabase database!'
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, ok: false, error: err.message, message: err.message }));
    }
    return;
  }

  // ============================================================
  // STATIC ASSETS SERVING
  // ============================================================
  let filePathStr = reqPath === '/' || reqPath === '' ? '/index.html' : reqPath;
  const safePath = path.normalize(filePathStr).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + reqPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` Honesty Store Production Server is running!`);
  console.log(` Local URL: http://localhost:${PORT}`);
  console.log(` Supabase & Cashfree endpoints active at /api/*`);
  console.log(`====================================================`);
});
