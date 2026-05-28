// Vercel KV access layer. Keys:
//   roster                -> { [slug]: { displayName, windsorAccountName, windsorAccountId, firstSeen, lastSeen, stale } }
//   client:<slug>         -> full dashboard snapshot
//
// The roster is the index of every client we've ever onboarded; client:<slug> holds
// the latest computed snapshot used by the dashboard page.

import { kv } from '@vercel/kv';

const ROSTER_KEY = 'roster';

export async function getRoster() {
  return (await kv.get(ROSTER_KEY)) || {};
}

export async function saveRoster(roster) {
  await kv.set(ROSTER_KEY, roster);
}

export async function getSnapshot(slug) {
  return kv.get(`client:${slug}`);
}

export async function saveSnapshot(slug, snapshot) {
  await kv.set(`client:${slug}`, snapshot);
}
