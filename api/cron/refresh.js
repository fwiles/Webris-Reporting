// Hourly cron entrypoint. Discovers every Meta account Windsor can see, auto-onboards
// new ones (zero-touch), pulls month-to-date data, computes KPIs, refreshes the daily
// AI note, and writes a snapshot per client to KV. The actual work lives in
// lib/refresh.js (shared with the on-demand /api/refresh button).
//
// Protected by CRON_SECRET: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.

import { runRefresh } from '../../lib/refresh.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  try {
    const summary = await runRefresh(new Date());
    return res.status(200).json(summary);
  } catch (e) {
    return res.status(502).json({ error: 'discovery/fetch failed', detail: e.message });
  }
}
