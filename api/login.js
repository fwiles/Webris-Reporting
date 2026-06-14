// POST /api/login { password } -> sets the portal session cookie on success.
// Gates the portal (master client list) only; client dashboards stay public.

import { checkPassword, sessionCookie } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }
  if (!process.env.PORTAL_PASSWORD) {
    return res.status(503).json({ error: 'portal password not configured' });
  }

  // Vercel parses JSON/urlencoded bodies into req.body; fall back to raw string if not.
  let password = req.body?.password;
  if (password == null && typeof req.body === 'string') {
    try { password = JSON.parse(req.body)?.password; } catch { /* ignore */ }
  }

  if (!checkPassword(password)) {
    return res.status(401).json({ error: 'incorrect password' });
  }

  res.setHeader('Set-Cookie', sessionCookie());
  return res.status(200).json({ ok: true });
}
