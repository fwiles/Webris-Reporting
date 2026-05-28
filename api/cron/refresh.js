// Hourly cron entrypoint. Discovers every Meta account Windsor can see, auto-onboards
// new ones (zero-touch), pulls month-to-date data, computes KPIs, refreshes the daily
// AI note, and writes a snapshot per client to KV.
//
// Protected by CRON_SECRET: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.

import { discoverAccounts, fetchAllData, fetchAllAdRows } from '../../lib/windsor.js';
import { buildSnapshot, topAdsForNote } from '../../lib/metrics.js';
import { resolveClient, clientMeta, isExcluded } from '../../lib/clients.js';
import { generateNote } from '../../lib/notes.js';
import { getRoster, saveRoster, getSnapshot, saveSnapshot } from '../../lib/store.js';

export const config = { maxDuration: 300 };

const STALE_AFTER_MISSES = 6; // ~6 hours of absence before flagging a client stale

function todayStr(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  const now = new Date();
  const today = todayStr(now);
  const results = [];

  let roster;
  let accounts;
  let raw;
  let adRows;
  try {
    // Windsor returns all accounts per query, so fetch everything once and split per client.
    [roster, accounts, raw, adRows] = await Promise.all([
      getRoster(),
      discoverAccounts(now),
      fetchAllData(now),
      fetchAllAdRows(now),
    ]);
  } catch (e) {
    return res.status(502).json({ error: 'discovery/fetch failed', detail: e.message });
  }

  const seenSlugs = new Set();

  for (const account of accounts) {
    try {
      if (await isExcluded(account)) {
        results.push({ slug: null, account: account.name, ok: true, excluded: true });
        continue;
      }
      const { slug, overlay } = await resolveClient(account);
      seenSlugs.add(slug);
      const meta = clientMeta(account, slug, overlay);

      // Roster bookkeeping (onboard new / refresh existing).
      const existing = roster[slug];
      roster[slug] = {
        displayName: meta.displayName,
        windsorAccountName: meta.windsorAccountName,
        windsorAccountId: meta.windsorAccountId,
        firstSeen: existing?.firstSeen || now.toISOString(),
        lastSeen: now.toISOString(),
        misses: 0,
        stale: false,
      };
      const isNew = !existing;

      // Compute KPIs from the shared batch, filtered to this account.
      const computed = buildSnapshot(raw, meta.windsorAccountName, now);

      // Daily AI note: reuse the prior note unless it's from a different day.
      const prevSnap = await getSnapshot(slug);
      let note = prevSnap?.note || null;
      let noteDate = prevSnap?.noteDate || null;
      if (noteDate !== today) {
        const topAds = topAdsForNote(adRows, meta.windsorAccountName);
        const generated = await generateNote({ displayName: meta.displayName, kpis: computed.kpis, topAds, now });
        if (generated) {
          note = generated;
          noteDate = today;
        }
      }

      await saveSnapshot(slug, {
        generatedAt: now.toISOString(),
        client: meta,
        ...computed,
        note,
        noteDate,
      });

      results.push({ slug, account: account.name, ok: true, new: isNew });
    } catch (e) {
      results.push({ slug: account.name, account: account.name, ok: false, error: e.message });
    }
  }

  // Mark clients absent from this run as progressively stale (kept, never deleted).
  for (const [slug, entry] of Object.entries(roster)) {
    if (seenSlugs.has(slug)) continue;
    entry.misses = (entry.misses || 0) + 1;
    if (entry.misses >= STALE_AFTER_MISSES) entry.stale = true;
  }

  await saveRoster(roster);

  return res.status(200).json({
    ranAt: now.toISOString(),
    discovered: accounts.length,
    onboarded: results.filter((r) => r.new).length,
    results,
  });
}
