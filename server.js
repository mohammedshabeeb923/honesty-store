const http = require('http');
const fs = require('fs');
const path = require('path');

// 0. Auto-load .env file if present (zero external dependencies)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)?$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  }
} catch (e) {
  console.warn('[Server] Could not parse .env file:', e.message);
}

// Authoritative Supabase & Database Data Layer
const serverSupabase = require('./server-supabase');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const crypto = require('crypto');

// Cryptographic HMAC Secret for Session Signing
const SERVER_SECRET = process.env.SERVER_SECRET || process.env.SUPABASE_ANON_KEY || 'honesty-store-cryptographic-token-salt-2026';

function signCustomerToken(phone, name) {
  const payload = {
    phone,
    name,
    role: 'customer',
    iat: Date.now(),
    exp: Date.now() + 30 * 24 * 3600 * 1000 // 30 days
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SERVER_SECRET).update(body).digest('base64url');
  return `hs_sess_${body}.${sig}`;
}

function verifyCustomerToken(token) {
  if (!token) return null;
  if (!token.startsWith('hs_sess_')) return null;
  const raw = token.slice('hs_sess_'.length);
  const parts = raw.split('.');
  if (parts.length === 1) {
    // Backwards compatibility for existing local sessions
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      const [ph] = decoded.split('_');
      if (ph && ph.length === 10) return { phone: ph, role: 'customer' };
    } catch (e) {}
    return null;
  }
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', SERVER_SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function signAdminToken(username) {
  const payload = {
    username,
    role: 'admin',
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 3600 * 1000 // 7 days
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SERVER_SECRET).update(body).digest('base64url');
  return `admin_sess_${body}.${sig}`;
}

function verifyAdminToken(token) {
  if (!token) return false;
  if (!token.startsWith('admin_sess_')) return false;
  const raw = token.slice('admin_sess_'.length);
  const parts = raw.split('.');
  if (parts.length === 1) {
    // Backwards compatibility for existing local admin session
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      if (decoded.startsWith('admin_')) return true;
    } catch (e) {}
    return false;
  }
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', SERVER_SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Date.now()) return false;
    return payload.role === 'admin';
  } catch (e) {
    return false;
  }
}

function isAuthorizedAdmin(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token && verifyAdminToken(token)) return true;
  const customHeader = req.headers['x-admin-token'];
  if (customHeader && verifyAdminToken(customHeader)) return true;
  return false;
}

// Secure Salted Password / PIN Hashing
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) {
    return false;
  }
  const [salt, key] = storedHash.split(':');
  const testHash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(testHash, 'hex'));
}

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

// Helper to parse raw body and JSON (for Webhook HMAC verification)
function parseRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      try {
        const json = rawBody ? JSON.parse(rawBody) : {};
        resolve({ rawBody, json });
      } catch (err) {
        resolve({ rawBody, json: {} });
      }
    });
    req.on('error', reject);
  });
}


// Gateway Config Management
const CONFIG_FILE = path.join(__dirname, '.gateway-config.json');

function loadGatewayConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {}
  return {};
}

function saveGatewayConfig(data) {
  try {
    const current = loadGatewayConfig();
    const updated = { ...current, ...data };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
    return updated;
  } catch (e) {
    return data;
  }
}

let runtimeOverrides = loadGatewayConfig();

function getCashfreeConfig() {
  const appId = (process.env.CASHFREE_APP_ID || 
                process.env.CASHFREE_CLIENT_ID || 
                process.env.APP_ID || 
                runtimeOverrides.appId || '').trim();

  const secretKey = (process.env.CASHFREE_SECRET_KEY || 
                    process.env.CASHFREE_CLIENT_SECRET || 
                    process.env.SECRET_KEY || 
                    runtimeOverrides.secretKey || '').trim();

  let env = (process.env.CASHFREE_ENV || runtimeOverrides.env || 'PRODUCTION').toUpperCase().trim();
  if (secretKey.startsWith('cfsk_ma_prod_')) {
    env = 'PRODUCTION';
  }

  return { appId, secretKey, env };
}

const server = http.createServer(async (req, res) => {
  const [reqPath, queryString] = req.url.split('?');
  const queryParams = new URLSearchParams(queryString || '');

  // Helper response sender
  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
  };

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PATCH, PUT',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // ============================================================
  // BACKEND API ROUTES
  // ============================================================

  // 1. Register Customer (Phone + Password / PIN)
  if (req.method === 'POST' && reqPath === '/api/register') {
    try {
      const { name, phone, password } = await parseJsonBody(req);
      const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
      const cleanName = (name || '').trim();
      const cleanPass = String(password || '').trim();

      if (!cleanPhone || cleanPhone.length !== 10) {
        sendJson(400, { success: false, message: 'Please enter a valid 10-digit mobile number' });
        return;
      }
      if (!cleanName) {
        sendJson(400, { success: false, message: 'Please enter your full name' });
        return;
      }
      if (!cleanPass || cleanPass.length < 4) {
        sendJson(400, { success: false, message: 'PIN or password must be at least 4 digits' });
        return;
      }

      // Check if user already exists
      const existing = await serverSupabase.getProfile(cleanPhone);
      if (existing && existing.password_hash) {
        sendJson(400, { success: false, message: 'This mobile number is already registered. Please sign in.' });
        return;
      }

      const pHash = hashPassword(cleanPass);
      const profile = await serverSupabase.registerUser(cleanName, cleanPhone, pHash);
      const token = signCustomerToken(cleanPhone, cleanName);
      console.log(`[Auth] Registered customer: ${cleanName} (+91 ${cleanPhone})`);

      sendJson(200, {
        success: true,
        message: 'Account created successfully',
        token,
        phone: cleanPhone,
        name: cleanName
      });
    } catch (err) {
      sendJson(400, { success: false, error: err.message, message: err.message });
    }
    return;
  }

  // 2. Login Customer (Phone + Password / PIN)
  if (req.method === 'POST' && reqPath === '/api/login') {
    try {
      const { phone, password } = await parseJsonBody(req);
      const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
      const cleanPass = String(password || '').trim();

      if (!cleanPhone || cleanPhone.length !== 10) {
        sendJson(400, { success: false, message: 'Please enter a valid 10-digit mobile number' });
        return;
      }
      if (!cleanPass) {
        sendJson(400, { success: false, message: 'Please enter your password or 4-digit PIN' });
        return;
      }

      const profile = await serverSupabase.getProfile(cleanPhone);
      if (!profile || !profile.password_hash) {
        sendJson(401, { success: false, message: 'Phone number not registered. Please create an account.' });
        return;
      }

      const isValid = verifyPassword(cleanPass, profile.password_hash);
      if (!isValid) {
        sendJson(401, { success: false, message: 'Incorrect PIN or password. Please try again.' });
        return;
      }

      const token = signCustomerToken(cleanPhone, profile.full_name || 'Customer');
      console.log(`[Auth] Customer signed in: ${profile.full_name || 'Customer'} (+91 ${cleanPhone})`);

      sendJson(200, {
        success: true,
        message: 'Signed in successfully',
        token,
        phone: cleanPhone,
        name: profile.full_name || 'Customer'
      });
    } catch (err) {
      sendJson(400, { success: false, error: err.message, message: err.message });
    }
    return;
  }


  // 3. Products List (Authoritative from Supabase)
  if (req.method === 'GET' && reqPath === '/api/products') {
    try {
      const products = await serverSupabase.getProducts();
      sendJson(200, { success: true, products });
    } catch (err) {
      sendJson(500, { success: false, error: err.message });
    }
    return;
  }

  // 4. Orders List (Authoritative from Supabase)
  if (req.method === 'GET' && reqPath === '/api/orders') {
    try {
      const phoneFilter = queryParams.get('phone');
      const orders = await serverSupabase.getOrders(phoneFilter);
      sendJson(200, { success: true, orders });
    } catch (err) {
      sendJson(500, { success: false, error: err.message });
    }
    return;
  }

  // 5. Community Metrics
  if (req.method === 'GET' && reqPath === '/api/community-metrics') {
    try {
      const metrics = serverSupabase.fallbackData.community_metrics || { sales_today: 0, store_visits: 0, completed_payments: 0 };
      sendJson(200, { success: true, metrics });
    } catch (err) {
      sendJson(500, { success: false, error: err.message });
    }
    return;
  }

  // 6. Admin Dashboard Aggregated Telemetry
  if (req.method === 'GET' && reqPath === '/api/admin/dashboard') {
    if (!isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const dashboard = await serverSupabase.getDashboardMetrics();
      sendJson(200, { success: true, ...dashboard });
    } catch (err) {
      sendJson(500, { success: false, error: err.message });
    }
    return;
  }

  // 7. Admin Users Telemetry (Sanitized - no password hashes exposed)
  if (req.method === 'GET' && reqPath === '/api/admin/users') {
    if (!isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const rawProfiles = await serverSupabase.getProfiles();
      const profiles = (rawProfiles || []).map(p => {
        const { password_hash, ...safe } = p;
        return safe;
      });
      const orders = await serverSupabase.getOrders();
      sendJson(200, { success: true, profiles, totalProfiles: profiles.length, totalOrders: orders.length });
    } catch (err) {
      sendJson(500, { success: false, error: err.message });
    }
    return;
  }

  // 8. Admin Adjust Stock
  if (req.method === 'POST' && reqPath === '/api/admin/adjust-stock') {
    if (!isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const { productId, newStockLevel, auditNote, auditedBy } = await parseJsonBody(req);
      if (!productId || newStockLevel === undefined) {
        throw new Error('productId and newStockLevel are required');
      }
      const result = await serverSupabase.adjustStock(productId, Number(newStockLevel), auditNote, auditedBy);
      sendJson(200, { success: true, ...result });
    } catch (err) {
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 9. Admin Add Product
  if (req.method === 'POST' && reqPath === '/api/admin/add-product') {
    if (!isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const productData = await parseJsonBody(req);
      if (!productData.name || !productData.price) {
        throw new Error('Product name and price are required');
      }
      const created = await serverSupabase.addProduct(productData);
      sendJson(200, { success: true, product: created });
    } catch (err) {
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 10. Admin Login
  if (req.method === 'POST' && reqPath === '/api/admin/login') {
    try {
      const { username, password } = await parseJsonBody(req);
      const expectedUser = process.env.ADMIN_USER || 'admin';
      const expectedPass = process.env.ADMIN_PASSWORD || 'admin123';

      if (username === expectedUser && password === expectedPass) {
        const adminToken = signAdminToken(username);
        sendJson(200, {
          success: true,
          adminToken,
          username
        });
      } else {
        sendJson(401, { success: false, message: 'Invalid admin credentials' });
      }
    } catch (err) {
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 11. Gateway Diagnostic Route
  if (req.method === 'GET' && reqPath === '/api/gateway-status') {
    const cf = getCashfreeConfig();
    sendJson(200, {
      hasAppId: !!cf.appId,
      appIdLength: cf.appId.length,
      appIdPreview: cf.appId ? (cf.appId.slice(0, 4) + '***' + cf.appId.slice(-4)) : null,
      hasSecretKey: !!cf.secretKey,
      secretLength: cf.secretKey.length,
      secretPreview: cf.secretKey ? (cf.secretKey.slice(0, 10) + '***' + cf.secretKey.slice(-4)) : null,
      env: cf.env
    });
    return;
  }

  // 12. Admin Gateway Config Save Route
  if (req.method === 'POST' && reqPath === '/api/admin/save-gateway-config') {
    if (!isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const { appId, secretKey, env } = await parseJsonBody(req);
      const updates = {};
      if (appId) updates.appId = appId.trim();
      if (secretKey) updates.secretKey = secretKey.trim();
      if (env) updates.env = env.trim().toUpperCase();

      runtimeOverrides = saveGatewayConfig(updates);
      const resolved = getCashfreeConfig();

      console.log(`[Admin] Gateway updated. AppId: ${!!resolved.appId}, SecretKey: ${!!resolved.secretKey}, Env: ${resolved.env}`);

      sendJson(200, {
        success: true,
        message: 'Cashfree Gateway credentials saved successfully',
        hasAppId: !!resolved.appId,
        hasSecretKey: !!resolved.secretKey,
        appIdPreview: resolved.appId ? (resolved.appId.slice(0, 4) + '***' + resolved.appId.slice(-4)) : null,
        env: resolved.env
      });
    } catch (err) {
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 13. Create Cashfree PG Order (Authoritative Server Validation & Stock Check)
  if (req.method === 'POST' && reqPath === '/api/create-cashfree-order') {
    try {
      const { orderId: requestedOrderId, items, orderAmount, customerPhone, customerName } = await parseJsonBody(req);
      const cleanPhone = (customerPhone || '9999999999').replace(/\D/g, '').slice(-10);
      
      // Collision-proof order ID (Cashfree compliant: alphanumeric, hyphen, underscore only)
      const safeRandom = crypto.randomBytes(3).toString('hex').toUpperCase();
      const generatedOrderId = 'HS_' + Date.now().toString(36).toUpperCase() + '_' + safeRandom;
      const orderId = String(requestedOrderId || generatedOrderId).replace(/[^a-zA-Z0-9_-]/g, '');

      const { appId, secretKey, env } = getCashfreeConfig();

      // AUTHORITATIVE PRICE & STOCK VALIDATION:
      // Compute total from database products, check availability
      let computedTotal = 0;
      let computedItems = [];

      if (Array.isArray(items) && items.length > 0) {
        for (const item of items) {
          const qty = Math.max(1, Number(item.qty) || 1);
          const dbProd = await serverSupabase.getProduct(item.id);

          if (!dbProd) {
            throw new Error(`Product not found: ${item.id}`);
          }
          if (dbProd.stock < qty) {
            throw new Error(`Insufficient stock for "${dbProd.name}". Only ${dbProd.stock} left in store.`);
          }

          const unitPrice = Number(dbProd.price);
          const itemTotal = unitPrice * qty;
          computedTotal += itemTotal;

          computedItems.push({
            id: dbProd.id,
            name: dbProd.name,
            variant: dbProd.variant,
            price: unitPrice,
            qty: qty,
            image: dbProd.image_url || dbProd.image
          });
        }
      } else {
        // Fallback if raw amount passed without items
        computedTotal = Number(orderAmount) || 1;
        computedItems.push({
          id: 'custom_item',
          name: 'Honesty Store Item',
          price: computedTotal,
          qty: 1
        });
      }

      console.log(`[Cashfree PG] Verified order ${orderId} for ₹${computedTotal} (${computedItems.length} items) [Customer: ${cleanPhone}]`);

      // Persist PENDING order authoritatively in Supabase & local data layer
      await serverSupabase.createOrder({
        id: orderId,
        customerPhone: cleanPhone,
        amount: computedTotal,
        itemCount: computedItems.reduce((acc, i) => acc + i.qty, 0),
        items: computedItems,
        status: 'PENDING',
        paymentMethod: 'UPI'
      });

      // Initiate Real Cashfree Order Session
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
            order_id: orderId,
            order_amount: computedTotal,
            order_currency: 'INR',
            customer_details: {
              customer_id: 'cust_' + cleanPhone,
              customer_phone: cleanPhone,
              customer_name: customerName || 'Honesty Customer'
            },
            order_meta: {
              return_url: (function() {
                let orig = req.headers.origin || req.headers.referer || 'https://honesty-store.onrender.com';
                try {
                  const u = new URL(orig);
                  if (env === 'PRODUCTION' || u.hostname === 'localhost') {
                    u.protocol = 'https:';
                    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
                      u.host = 'honesty-store.onrender.com';
                    }
                  }
                  return `${u.origin}/?order_id={order_id}`;
                } catch (e) {
                  return 'https://honesty-store.onrender.com/?order_id={order_id}';
                }
              })()
            }
          })
        });

        const cfData = await cfRes.json();
        if (cfRes.ok && cfData.payment_session_id) {
          sendJson(200, {
            success: true,
            orderId,
            orderAmount: computedTotal,
            items: computedItems,
            paymentSessionId: cfData.payment_session_id,
            environment: env
          });
          return;
        } else {
          console.warn('[Cashfree PG API Response Error]:', cfData);
          sendJson(400, {
            success: false,
            error: cfData.message || 'Could not initiate Cashfree payment session',
            cfData,
            environment: env
          });
          return;
        }
      }

      throw new Error('Cashfree credentials are not configured on the server. Please provide CASHFREE_APP_ID and CASHFREE_SECRET_KEY.');
    } catch (err) {
      console.error('[Cashfree Order Error]:', err.message);
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 14. Cashfree Payment Webhook (Idempotent background confirmation with HMAC verification)
  if (req.method === 'POST' && reqPath === '/api/cashfree-webhook') {
    try {
      const { rawBody, json: webhookData } = await parseRawBody(req);
      const signature = req.headers['x-webhook-signature'];
      const timestamp = req.headers['x-webhook-timestamp'];
      const { secretKey } = getCashfreeConfig();

      if (signature && timestamp && secretKey) {
        const computedSignature = crypto.createHmac('sha256', secretKey)
          .update(timestamp + rawBody)
          .digest('base64');
        if (signature !== computedSignature) {
          console.warn('[Cashfree Webhook] Invalid signature rejected!');
          sendJson(401, { error: 'Invalid webhook signature' });
          return;
        }
      }

      console.log('[Cashfree Webhook Received]:', JSON.stringify(webhookData).slice(0, 300));
      
      const orderId = webhookData?.data?.order?.order_id || webhookData?.order_id;
      const paymentStatus = webhookData?.data?.payment?.payment_status || webhookData?.payment_status;
      const paymentId = webhookData?.data?.payment?.cf_payment_id || webhookData?.cf_payment_id;

      if (orderId && (paymentStatus === 'SUCCESS' || paymentStatus === 'PAID')) {
        await serverSupabase.confirmOrderPayment(orderId, paymentId, orderId);
        console.log(`[Cashfree Webhook] Order ${orderId} confirmed as PAID.`);
      }

      sendJson(200, { status: 'ACKNOWLEDGED' });
    } catch (e) {
      sendJson(400, { error: 'Webhook processing error', details: e.message });
    }
    return;
  }

  // 15. Verify Cashfree Order Payment (Authoritative Check & Inventory Deduction)
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

        if (isPaid) {
          // Atomically confirm payment, deduct inventory in Supabase, and increment community metrics
          const confirmResult = await serverSupabase.confirmOrderPayment(
            orderId, 
            orderData.cf_payment_id || orderData.cf_order_id, 
            orderData.cf_order_id
          );

          sendJson(200, {
            success: true,
            isPaid: true,
            orderStatus: 'PAID',
            orderAmount: orderData.order_amount,
            cfOrderId: orderData.cf_order_id,
            order: confirmResult.order,
            alreadyPaid: confirmResult.alreadyPaid
          });
          return;
        } else {
          sendJson(200, {
            success: true,
            isPaid: false,
            orderStatus: orderData.order_status || 'PENDING',
            orderData
          });
          return;
        }
      }

      throw new Error('Cashfree credentials missing for payment verification.');
    } catch (err) {
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 16. Test Supabase Connection
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

      // Check count of products
      const countRes = await fetch(`${cleanUrl}/rest/v1/products?select=id`, {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        }
      });
      const prods = countRes.ok ? await countRes.json() : [];

      sendJson(200, {
        success: true,
        ok: true,
        message: 'Successfully verified connection to Supabase database!',
        tables: {
          products: Array.isArray(prods) ? prods.length : 0
        }
      });
    } catch (err) {
      sendJson(400, { success: false, ok: false, error: err.message, message: err.message });
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
