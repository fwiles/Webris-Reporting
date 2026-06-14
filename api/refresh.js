// POST /api/refresh -> on-demand full refresh of every client (the "Refresh all" button
// on the portal). Same work as the hourly cron, triggered manually.
//
// Auth: requires a valid portal session (the locked portal is the only place the button
// lives). The hourly cron uses /api/cron/refresh with CRON_SECRET instead.

import { isAuthed } from '../lib/auth.js';
import { runRefresh } from '../lib/refresh.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }
  if (!isAuthed(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const summary = await runRefresh(new Date());
    return res.status(200).json(summary);
  } catch (e) {
    return res.status(502).json({ error: 'refresh failed', detail: e.message });
  }
}
