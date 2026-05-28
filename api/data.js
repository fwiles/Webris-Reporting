// GET /api/data?client=<slug> -> the latest snapshot for one client.

import { getSnapshot } from '../lib/store.js';

export default async function handler(req, res) {
  const slug = req.query.client;
  if (!slug) return res.status(400).json({ error: 'missing client param' });

  const snapshot = await getSnapshot(slug);
  if (!snapshot) return res.status(404).json({ error: 'no data for client', slug });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  return res.status(200).json(snapshot);
}
