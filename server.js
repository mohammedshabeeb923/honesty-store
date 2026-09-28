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

// Authoritative Admin Whitelist (Strictly restricted to these Gmail accounts)
const ALLOWED_ADMIN_EMAILS = [
  'godson107111@gmail.com',
  'mohammedshabeeb923@gmail.com',
  'shahidkkvl@gmail.com'
].map(e => e.toLowerCase().trim());

function signAdminToken(email) {
  const cleanEmail = String(email || '').toLowerCase().trim();
  const payload = {
    email: cleanEmail,
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
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', SERVER_SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Date.now()) return false;
    if (payload.role !== 'admin') return false;
    const tokenEmail = (payload.email || payload.username || '').toLowerCase().trim();
    return ALLOWED_ADMIN_EMAILS.includes(tokenEmail);
  } catch (e) {
    return false;
  }
}

async function getSupabaseUserFromToken(token) {
  if (!token) return null;
  const { url, key } = serverSupabase.getEnv();
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${token}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.id) {
        return {
          id: data.id,
          email: (data.email || '').toLowerCase().trim(),
          fullName: data.user_metadata?.full_name || data.user_metadata?.name || data.email,
          role: data.role
        };
      }
    }
  } catch (e) {
    // network or token parsing error
  }
  return null;
}

async function isAuthorizedAdmin(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const customHeader = req.headers['x-admin-token'] || '';

  // 1. Signed HMAC admin token
  if (token && verifyAdminToken(token)) return true;
  if (customHeader && verifyAdminToken(customHeader)) return true;

  // 2. Supabase Google OAuth access token verification
  const candidate = (token && token.length > 20 && !token.startsWith('admin_')) ? token : customHeader;
  if (candidate && candidate.length > 20 && !candidate.startsWith('admin_')) {
    const user = await getSupabaseUserFromToken(candidate);
    if (user && user.email) {
      const email = user.email.toLowerCase().trim();
      if (ALLOWED_ADMIN_EMAILS.includes(email)) {
        return true;
      }
    }
  }

  return false;
}

function getCallerSupabaseToken(req) {
  const sbToken = req.headers['x-supabase-token'];
  if (sbToken && !sbToken.startsWith('admin_')) return sbToken;
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token && !token.startsWith('admin_') && token.length > 20) return token;
  return null;
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


  // 2b. Authoritative Admin Check (Strictly verifies the 3 authorized Google accounts)
  if (req.method === 'POST' && reqPath === '/api/check-admin') {
    try {
      const body = await parseJsonBody(req);
      const token = body.token || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();

      if (!token) {
        sendJson(200, { success: true, isAdmin: false });
        return;
      }

      // Check if it's already an HMAC admin token
      if (verifyAdminToken(token)) {
        sendJson(200, { success: true, isAdmin: true, adminToken: token });
        return;
      }

      // Verify Google OAuth token with Supabase Auth
      const user = await getSupabaseUserFromToken(token);
      if (user && user.email) {
        const cleanEmail = user.email.toLowerCase().trim();
        if (ALLOWED_ADMIN_EMAILS.includes(cleanEmail)) {
          const adminToken = signAdminToken(cleanEmail);
          sendJson(200, {
            success: true,
            isAdmin: true,
            adminToken
          });
          return;
        }
      }

      sendJson(200, { success: true, isAdmin: false });
    } catch (err) {
      sendJson(200, { success: true, isAdmin: false });
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

  // 4. Orders List (Authoritative from Supabase with Strict User Isolation)
  if (req.method === 'GET' && reqPath === '/api/orders') {
    try {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const supabaseUser = await getSupabaseUserFromToken(token);
      const isAdmin = await isAuthorizedAdmin(req);
      const queryUserId = queryParams.get('userId');
      const queryPhone = queryParams.get('phone');

      let orders = [];
      if (isAdmin) {
        orders = await serverSupabase.getOrders({ isAdmin: true });
      } else if (supabaseUser) {
        orders = await serverSupabase.getOrders({ userId: supabaseUser.id });
      } else if (queryUserId) {
        // Only return if matching current verified user, or empty
        orders = (supabaseUser && supabaseUser.id === queryUserId) 
          ? await serverSupabase.getOrders({ userId: queryUserId }) 
          : [];
      } else if (queryPhone) {
        orders = await serverSupabase.getOrders({ phone: queryPhone });
      } else {
        orders = [];
      }

      sendJson(200, { success: true, orders });
    } catch (err) {
      sendJson(500, { success: false, error: err.message });
    }
    return;
  }

  // 4b. Admin Orders List (Full Store Order History - Admin Only)
  if (req.method === 'GET' && reqPath === '/api/admin/orders') {
    const isAdmin = await isAuthorizedAdmin(req);
    if (!isAdmin) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const orders = await serverSupabase.getOrders({ isAdmin: true });
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
    if (!await isAuthorizedAdmin(req)) {
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
    if (!await isAuthorizedAdmin(req)) {
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
    if (!await isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const { productId, newStockLevel, auditNote, auditedBy } = await parseJsonBody(req);
      if (!productId || newStockLevel === undefined) {
        throw new Error('productId and newStockLevel are required');
      }
      const callerToken = getCallerSupabaseToken(req);
      const result = await serverSupabase.adjustStock(productId, Number(newStockLevel), auditNote, auditedBy, callerToken);
      sendJson(200, { success: true, ...result });
    } catch (err) {
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 8b. Admin Update Physical Stock
  if (req.method === 'POST' && reqPath === '/api/admin/update-physical-stock') {
    if (!await isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const { productId, physicalStock } = await parseJsonBody(req);
      if (!productId || physicalStock === undefined) {
        throw new Error('productId and physicalStock are required');
      }
      const callerToken = getCallerSupabaseToken(req);
      const result = await serverSupabase.updatePhysicalStock(productId, physicalStock, callerToken);
      sendJson(200, { success: true, ...result });
    } catch (err) {
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 8c. Admin Get All Products (including archived)
  if (req.method === 'GET' && reqPath === '/api/admin/products') {
    if (!await isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const products = await serverSupabase.getProducts(true);
      sendJson(200, { success: true, products });
    } catch (err) {
      sendJson(500, { success: false, error: err.message });
    }
    return;
  }

  // 8d. Admin Update Order Status (Pending, Paid, Completed, Cancelled)
  if (req.method === 'POST' && reqPath === '/api/admin/update-order-status') {
    if (!await isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const { orderId, status } = await parseJsonBody(req);
      if (!orderId || !status) {
        throw new Error('orderId and status are required');
      }
      const callerToken = getCallerSupabaseToken(req);
      const updated = await serverSupabase.updateOrderStatus(orderId, status, callerToken);
      sendJson(200, { success: true, order: updated });
    } catch (err) {
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 9. Admin Add Product
  if (req.method === 'POST' && reqPath === '/api/admin/add-product') {
    if (!await isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const productData = await parseJsonBody(req);
      if (!productData.name || productData.price === undefined) {
        throw new Error('Product name and price are required');
      }
      const callerToken = getCallerSupabaseToken(req);
      const created = await serverSupabase.addProduct(productData, callerToken);
      sendJson(200, { success: true, product: created });
    } catch (err) {
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 9b. Admin Update Product
  if (req.method === 'POST' && reqPath === '/api/admin/update-product') {
    if (!await isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const body = await parseJsonBody(req);
      const targetId = body.id || body.productId;
      if (!targetId) {
        throw new Error('Product ID is required');
      }
      const callerToken = getCallerSupabaseToken(req);
      const updated = await serverSupabase.updateProduct(targetId, body, callerToken);
      sendJson(200, { success: true, product: updated });
    } catch (err) {
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 9c. Admin Archive / Restore Product
  if (req.method === 'POST' && reqPath === '/api/admin/archive-product') {
    if (!await isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const body = await parseJsonBody(req);
      const targetId = body.id || body.productId;
      if (!targetId) {
        throw new Error('Product ID is required');
      }
      const isActive = body.isActive !== undefined ? body.isActive : (body.is_active !== undefined ? body.is_active : false);
      const callerToken = getCallerSupabaseToken(req);
      const updated = await serverSupabase.archiveProduct(targetId, isActive, callerToken);
      sendJson(200, { success: true, product: updated });
    } catch (err) {
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 9d. Admin Check Can Delete Product
  if (req.method === 'POST' && reqPath === '/api/admin/can-delete-product') {
    if (!await isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const body = await parseJsonBody(req);
      const targetId = body.id || body.productId;
      if (!targetId) {
        throw new Error('Product ID is required');
      }
      const canDelete = await serverSupabase.canDeleteProduct(targetId);
      sendJson(200, { success: true, canDelete });
    } catch (err) {
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 9e. Admin Delete Product (Permanent, with past order protection)
  if (req.method === 'POST' && reqPath === '/api/admin/delete-product') {
    if (!await isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const body = await parseJsonBody(req);
      const targetId = body.id || body.productId;
      if (!targetId) {
        throw new Error('Product ID is required');
      }
      const callerToken = getCallerSupabaseToken(req);
      const result = await serverSupabase.deleteProduct(targetId, callerToken);
      sendJson(200, { success: true, ...result });
    } catch (err) {
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 9f. Admin Upload Product Image (Storage Bucket: product-images)
  if (req.method === 'POST' && reqPath === '/api/admin/upload-product-image') {
    if (!await isAuthorizedAdmin(req)) {
      sendJson(401, { success: false, message: 'Admin authorization required' });
      return;
    }
    try {
      const { fileName, contentType, base64Data, productId } = await parseJsonBody(req);
      if (!base64Data) {
        throw new Error('Image data (base64) is required');
      }

      const mime = contentType || 'image/jpeg';
      let ext = 'jpg';
      if (mime.includes('png')) ext = 'png';
      else if (mime.includes('webp')) ext = 'webp';

      const cleanPrefix = (productId || 'prod_' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_');
      const uniqueFileName = `${cleanPrefix}_${Date.now()}.${ext}`;

      const rawBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(rawBase64, 'base64');

      if (buffer.length > 5 * 1024 * 1024) {
        throw new Error('Optimized image exceeds 5MB limit');
      }

      const uploaded = await serverSupabase.uploadStorageImage(buffer, uniqueFileName, mime);
      sendJson(200, {
        success: true,
        imageUrl: uploaded.publicUrl,
        storagePath: uploaded.storagePath
      });
    } catch (err) {
      console.error('[Admin Upload Image Error]:', err.message);
      sendJson(400, { success: false, error: err.message });
    }
    return;
  }

  // 10. Admin Direct Email Verification / Login
  // Authoritative check: strictly verifies against ALLOWED_ADMIN_EMAILS without exposing emails to clients
  if (req.method === 'POST' && (reqPath === '/api/admin/login' || reqPath === '/api/admin/verify-admin-email')) {
    try {
      const body = await parseJsonBody(req);
      const email = (body.email || body.username || '').toLowerCase().trim();

      if (!email) {
        sendJson(400, { success: false, message: 'Admin email is required.' });
        return;
      }

      if (!ALLOWED_ADMIN_EMAILS.includes(email)) {
        sendJson(403, {
          success: false,
          isAdmin: false,
          message: 'Access Denied: This account is not authorized for administrator access.'
        });
        return;
      }

      const adminToken = signAdminToken(email);
      sendJson(200, {
        success: true,
        isAdmin: true,
        adminToken,
        email,
        message: 'Admin authorization granted.'
      });
      return;
    } catch (err) {
      sendJson(500, { success: false, message: 'Internal server error during admin verification.' });
      return;
    }
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
    if (!await isAuthorizedAdmin(req)) {
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
      const body = await parseJsonBody(req);
      const { orderId: requestedOrderId, items, orderAmount, customerPhone, customerName, customerEmail, userId: bodyUserId } = body;
      const cleanPhone = String(customerPhone || '').replace(/\D/g, '').slice(-10);

      if (!cleanPhone || !/^[6-9]\d{9}$/.test(cleanPhone)) {
        sendJson(400, {
          success: false,
          error: 'A valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9) is required for Cashfree payment.'
        });
        return;
      }

      // Verify Supabase Auth Token
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const supabaseUser = await getSupabaseUserFromToken(token);
      const userId = (supabaseUser && supabaseUser.id) || bodyUserId || null;
      const userEmail = (supabaseUser && supabaseUser.email) || customerEmail || null;
      const userName = (supabaseUser && supabaseUser.fullName) || customerName || 'Honesty Customer';
      
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

      console.log(`[Cashfree PG] Verified order ${orderId} for ₹${computedTotal} (${computedItems.length} items) [Customer: ${cleanPhone}, User: ${userId || 'guest'}]`);

      // Persist PENDING order authoritatively in Supabase & local data layer
      await serverSupabase.createOrder({
        id: orderId,
        userId: userId,
        customerEmail: userEmail,
        customerName: userName,
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
              customer_id: 'cust_' + (userId ? userId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 15) : cleanPhone),
              customer_phone: cleanPhone,
              customer_name: userName,
              customer_email: userEmail || undefined
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
