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

  // 3. Create Cashfree PG Order
  if (req.method === 'POST' && reqPath === '/api/create-cashfree-order') {
    try {
      const { orderId, orderAmount, customerPhone, customerName } = await parseJsonBody(req);

      console.log(`[Cashfree PG] Initiating order ${orderId} for ₹${orderAmount} (Customer: ${customerPhone})`);

      // Mock session ID for seamless checkout flow
      const paymentSessionId = 'session_' + Buffer.from(orderId + '_' + Date.now()).toString('base64');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        orderId,
        orderAmount,
        paymentSessionId,
        environment: process.env.CASHFREE_ENV || 'SANDBOX'
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
