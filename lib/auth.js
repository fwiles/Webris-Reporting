// Shared-password gate for the PORTAL only (the master client list). Client dashboards
// (/dashboard.html?client=X and /api/data) stay public — Vercel's platform password
// protection is all-or-nothing, so portal-only protection has to live in the app.
//
// The session cookie holds sha256(PORTAL_PASSWORD). An attacker can't forge it without
// knowing the password, and we never store the password itself in the browser.
//
// Fails CLOSED: if PORTAL_PASSWORD is unset, the portal is locked and login is impossible.
// Set PORTAL_PASSWORD in the Vercel project env (Production + Preview) to enable access.

import { createHash, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'portal_session';

function expectedToken() {
  const pw = process.env.PORTAL_PASSWORD;
  if (!pw) return null;
  return createHash('sha256').update(pw).digest('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// True if the request carries a valid portal session cookie.
export function isAuthed(req) {
  const expected = expectedToken();
  if (!expected) return false; // no password configured -> locked
  const token = parseCookies(req.headers.cookie || '')[SESSION_COOKIE];
  return !!token && safeEqual(token, expected);
}

// Constant-time check of a submitted password against PORTAL_PASSWORD.
export function checkPassword(password) {
  const pw = process.env.PORTAL_PASSWORD;
  if (!pw || typeof password !== 'string') return false;
  return safeEqual(password, pw);
}

// Set-Cookie header value for a 30-day session.
export function sessionCookie() {
  const token = expectedToken();
  const maxAge = 60 * 60 * 24 * 30;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
