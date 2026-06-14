// Thin wrapper over the Windsor.ai REST API.
// Base: https://connectors.windsor.ai/{connector}?api_key=...&fields=...&date_from=...&date_to=...
// Returns JSON: { data: [ {field: value, ...}, ... ] }.
//
// NOTE: Windsor does NOT filter server-side by account (verified — account_id/accounts
// params are ignored; every query returns ALL accounts grouped by account_name). So we
// fetch each dataset ONCE for all accounts and split per-client downstream via
// metrics.acctRows(rows, accountName). This keeps the hourly run to ~5 API calls total.

const BASE = 'https://connectors.windsor.ai';
const CONNECTOR = 'facebook'; // Meta Ads (Facebook & Instagram)

function pad(n) {
  return String(n).padStart(2, '0');
}
function fmtD(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function apiKey() {
  const key = process.env.WINDSOR_API_KEY;
  if (!key) throw new Error('WINDSOR_API_KEY is not set');
  return key;
}

// One raw request. Returns the rows array (all accounts).
async function query({ fields, date_from, date_to }) {
  const params = new URLSearchParams({
    api_key: apiKey(),
    fields: fields.join(','),
    date_from,
    date_to,
    _renderer: 'json',
  });
  const url = `${BASE}/${CONNECTOR}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Windsor ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : json.data || json.rows || [];
}

// Discover the distinct Meta accounts Windsor can see right now (those with MTD activity).
// Returns [{ id, name }]. Live equivalent of get_connectors; drives zero-touch onboarding.
export async function discoverAccounts(now = new Date()) {
  const rows = await query({
    fields: ['account_id', 'account_name', 'spend'],
    date_from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
    date_to: fmtD(now),
  });
  const seen = new Map();
  for (const r of rows) {
    const name = r.account_name;
    if (!name) continue;
    if (!seen.has(name)) seen.set(name, { id: r.account_id || null, name });
  }
  return [...seen.values()];
}

// Fetch the four datasets ALL clients need in one batch (one call each, all accounts).
// Mirrors the field choices in portal_SGF.html's fetchData(). Split per-client with
// metrics.buildSnapshot(raw, accountName, now).
export async function fetchAllData(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = fmtD(now);
  const mStart = `${y}-${pad(m + 1)}-01`;
  const pEnd = new Date(y, m, 0);
  const pStart = `${pEnd.getFullYear()}-${pad(pEnd.getMonth() + 1)}-01`;
  const pEndStr = fmtD(pEnd);

  const [mtd, prev, camps, ytd] = await Promise.all([
    query({
      fields: ['account_name', 'spend', 'impressions', 'link_clicks', 'actions_lead', 'actions_onsite_conversion_lead_grouped', 'cost_per_action_type_lead'],
      date_from: mStart,
      date_to: today,
    }),
    query({
      fields: ['account_name', 'spend', 'impressions', 'link_clicks', 'actions_lead', 'actions_onsite_conversion_lead_grouped', 'cost_per_action_type_lead'],
      date_from: pStart,
      date_to: pEndStr,
    }),
    query({
      fields: ['account_name', 'campaign', 'spend', 'impressions', 'link_clicks', 'actions_lead', 'actions_onsite_conversion_lead_grouped', 'cost_per_action_type_lead'],
      date_from: mStart,
      date_to: today,
    }),
    query({
      fields: ['account_name', 'year_month', 'spend', 'impressions', 'actions_lead', 'actions_onsite_conversion_lead_grouped'],
      date_from: `${y}-01-01`,
      date_to: today,
    }),
  ]);

  return { mtd, prev, camps, ytd };
}

// Ad-level rows for ALL accounts (one call). Split per-client with metrics.topAdsForNote.
export async function fetchAllAdRows(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  return query({
    fields: ['account_name', 'ad_name', 'thumbnail_url', 'spend', 'impressions', 'actions_lead', 'actions_onsite_conversion_lead_grouped', 'cost_per_action_type_lead', 'ctr'],
    date_from: `${y}-${pad(m + 1)}-01`,
    date_to: fmtD(now),
  });
}
