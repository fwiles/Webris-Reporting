// Shared refresh routine: discover every Meta account Windsor can see, auto-onboard new
// ones, pull month-to-date data, compute KPIs + top ads, refresh the daily AI note, and
// write a snapshot per client to KV. Used by both the hourly cron (api/cron/refresh.js)
// and the on-demand "Refresh all" button (api/refresh.js).

import { discoverAccounts, fetchAllData, fetchAllAdRows } from './windsor.js';
import { buildSnapshot, topAds, topAdsForNote } from './metrics.js';
import { resolveClient, clientMeta, isExcluded } from './clients.js';
import { generateNote } from './notes.js';
import { getRoster, saveRoster, getSnapshot, saveSnapshot } from './store.js';

const STALE_AFTER_MISSES = 6; // ~6 hours of absence before flagging a client stale

function todayStr(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Process one discovered account: roster bookkeeping, KPI/ads compute, daily note, save.
// Mutates `roster` in place. Returns a per-account result row for the summary.
async function processAccount(account, { roster, raw, adRows, now, today }) {
  if (await isExcluded(account)) {
    return { slug: null, account: account.name, ok: true, excluded: true };
  }

  const { slug, overlay } = await resolveClient(account);
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

  // Top 10 ads (with creative thumbnails) for the dashboard table.
  const ads = topAds(adRows, meta.windsorAccountName);

  // Daily AI note: reuse the prior note unless it's from a different day.
  const prevSnap = await getSnapshot(slug);
  let note = prevSnap?.note || null;
  let noteDate = prevSnap?.noteDate || null;
  if (noteDate !== today) {
    const adsForNote = topAdsForNote(adRows, meta.windsorAccountName);
    const generated = await generateNote({ displayName: meta.displayName, kpis: computed.kpis, topAds: adsForNote, now });
    if (generated) {
      note = generated;
      noteDate = today;
    }
  }

  await saveSnapshot(slug, {
    generatedAt: now.toISOString(),
    client: meta,
    ...computed,
    ads,
    note,
    noteDate,
  });

  return { slug, account: account.name, ok: true, new: isNew };
}

// Run a full refresh across every discovered account. Returns a summary object.
// Throws if the initial discovery/fetch fails (callers map that to a 502).
export async function runRefresh(now = new Date()) {
  const today = todayStr(now);
  const results = [];

  // Windsor returns all accounts per query, so fetch everything once and split per client.
  const [roster, accounts, raw, adRows] = await Promise.all([
    getRoster(),
    discoverAccounts(now),
    fetchAllData(now),
    fetchAllAdRows(now),
  ]);

  const ctx = { roster, raw, adRows, now, today };
  const seenSlugs = new Set();

  for (const account of accounts) {
    try {
      const r = await processAccount(account, ctx);
      if (r.slug) seenSlugs.add(r.slug);
      results.push(r);
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

  return {
    ranAt: now.toISOString(),
    discovered: accounts.length,
    onboarded: results.filter((r) => r.new).length,
    results,
  };
}
