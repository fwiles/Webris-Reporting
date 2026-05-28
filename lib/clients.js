// Client roster helpers: slug derivation and merging the optional config/clients.json
// overlay onto whatever Windsor discovers. KV is the source of truth for which
// dashboards exist; this file only supplies Drive links + branding metadata.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config', 'clients.json');

// Stable slug from an account name: lowercase, strip a leading "AC - " prefix,
// keep alphanumerics, collapse the rest to single dashes.
export function slugify(name) {
  return String(name)
    .replace(/^ac\s*-\s*/i, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

let _configCache = null;
let _excludeCache = [];
export async function loadConfig() {
  if (_configCache) return _configCache;
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    delete parsed._comment;
    // `_exclude` (optional): account names to keep OUT of the portal (internal/test accounts).
    _excludeCache = (parsed._exclude || []).map((s) => String(s).toLowerCase());
    delete parsed._exclude;
    _configCache = parsed;
  } catch {
    _configCache = {};
  }
  return _configCache;
}

// True if this account should be skipped (matched by exact name or slug, case-insensitive).
export async function isExcluded(account) {
  await loadConfig();
  const name = String(account.name).toLowerCase();
  const slug = slugify(account.name);
  return _excludeCache.some((x) => x === name || x === slug);
}

// Find the config entry for an account by matching windsorAccountId or windsorAccountName,
// falling back to slug-key match. Returns { slug, overlay } where overlay may be {}.
export async function resolveClient(account) {
  const config = await loadConfig();
  const slugFromName = slugify(account.name);

  for (const [slug, entry] of Object.entries(config)) {
    if (
      (account.id && entry.windsorAccountId === account.id) ||
      (entry.windsorAccountName && entry.windsorAccountName === account.name) ||
      slug === slugFromName
    ) {
      return { slug, overlay: entry };
    }
  }
  return { slug: slugFromName, overlay: {} };
}

// Build the display metadata block stored in each snapshot.
export function clientMeta(account, slug, overlay) {
  const driveLinks = overlay.driveLinks || [];
  return {
    slug,
    windsorAccountId: account.id || overlay.windsorAccountId || null,
    windsorAccountName: account.name,
    displayName: overlay.displayName || account.name,
    eyebrow: overlay.eyebrow || 'P&A · Facebook Ads',
    driveLinks,
    needsDriveLinks: driveLinks.length === 0,
  };
}
