// api/auth.js
// Handles login, logout, and "who am I" requests.
// Users and passwords are stored as Vercel environment variables.
//
// Required env vars (set in Vercel project settings):
//   USERS_JSON   — JSON object: {"larry":"password1","savannah":"password2"}
//   AUTH_SECRET  — random 32+ char string for signing cookies
//
// Cookie format: <username>.<expiryEpoch>.<hmacSha256Hex>
// Cookie is HTTP-only, Secure, SameSite=Lax, 30-day expiry.

import crypto from 'crypto';

const COOKIE_NAME = 'build_session';
const COOKIE_DAYS = 30;

function getUsers() {
  try {
    return JSON.parse(process.env.USERS_JSON || '{}');
  } catch {
    return {};
  }
}

function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('AUTH_SECRET environment variable is not set or too short');
  }
  return s;
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

function makeToken(username) {
  const expiry = Date.now() + COOKIE_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${username}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [username, expiryStr, signature] = parts;
  const expiry = parseInt(expiryStr, 10);
  if (!username || !expiry || isNaN(expiry)) return null;
  if (Date.now() > expiry) return null;
  const expected = sign(`${username}.${expiry}`);
  if (expected !== signature) return null;
  return { username, expiry };
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(/;\s*/).forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > 0) out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
  });
  return out;
}

export function getUserFromRequest(req) {
  const cookies = parseCookies(req);
  return verifyToken(cookies[COOKIE_NAME]);
}

export default async function handler(req, res) {
  // GET /api/auth — who am I?
  if (req.method === 'GET') {
    const user = getUserFromRequest(req);
    if (user) return res.status(200).json({ ok: true, username: user.username });
    return res.status(401).json({ ok: false, error: 'not_authenticated' });
  }

  // POST /api/auth — login or logout
  if (req.method === 'POST') {
    const { action, username, password } = req.body || {};

    if (action === 'logout') {
      res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
      return res.status(200).json({ ok: true });
    }

    if (action === 'login') {
      const users = getUsers();
      if (!username || !password) {
        return res.status(400).json({ ok: false, error: 'username_and_password_required' });
      }
      const stored = users[username.toLowerCase()];
      if (!stored || stored !== password) {
        // Fixed-time-ish failure delay to discourage brute-force
        await new Promise(r => setTimeout(r, 300));
        return res.status(401).json({ ok: false, error: 'invalid_credentials' });
      }
      const token = makeToken(username.toLowerCase());
      const maxAge = COOKIE_DAYS * 24 * 60 * 60;
      res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
      );
      return res.status(200).json({ ok: true, username: username.toLowerCase() });
    }

    return res.status(400).json({ ok: false, error: 'unknown_action' });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
