// GET /api/clients -> list of clients for the index page, sorted by display name.
// Active (non-stale) clients first. Pulls the lightweight client meta from each snapshot.

import { getRoster, getSnapshot } from '../lib/store.js';
import { isAuthed } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });

  const roster = await getRoster();
  const slugs = Object.keys(roster);

  const list = await Promise.all(
    slugs.map(async (slug) => {
      const snap = await getSnapshot(slug);
      const entry = roster[slug];
      return {
        slug,
        displayName: snap?.client?.displayName || entry.displayName || slug,
        hasData: !!snap,
        generatedAt: snap?.generatedAt || null,
        needsDriveLinks: snap?.client?.needsDriveLinks ?? true,
        stale: !!entry.stale,
        spend: snap?.kpis?.spend ?? null,
        leads: snap?.kpis?.leads ?? null,
        cpl: snap?.kpis?.cpl ?? null,
      };
    })
  );

  list.sort((a, b) => {
    if (a.stale !== b.stale) return a.stale ? 1 : -1;
    return a.displayName.localeCompare(b.displayName);
  });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  return res.status(200).json(list);
}
