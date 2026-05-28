// Metric helpers ported VERBATIM from portal_SGF.html so the numbers the hosted
// dashboard reports match the original mockup exactly. Keep this logic in sync with
// the field choices in lib/windsor.js.

const MS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Windsor returns either actions_lead or the grouped onsite-conversion lead field
// depending on the account's pixel setup. Prefer the direct lead, fall back to grouped.
export function normLeads(row) {
  const a = parseFloat(row.actions_lead) || 0;
  const b = parseFloat(row.actions_onsite_conversion_lead_grouped) || 0;
  return a > 0 ? a : b;
}

export function sumF(rows, f) {
  return rows.reduce((s, r) => s + (parseFloat(r[f]) || 0), 0);
}

// Rows come back for one account already (we filter by accounts in the API call),
// but Windsor occasionally returns blank account rows — keep the exact-name guard.
export function acctRows(rows, accountName) {
  return rows.filter((r) => r.account_name === accountName);
}

// Build the full snapshot payload from the four raw row sets. `now` is a Date.
// Returns { kpis, ytd, campaigns } — plain JSON, ready to store in KV.
export function buildSnapshot({ mtd, prev, camps, ytd }, accountName, now) {
  const mtdRows = acctRows(mtd, accountName);
  const prevRows = acctRows(prev, accountName);
  const campRows = acctRows(camps, accountName);
  const ytdRows = acctRows(ytd, accountName);

  const spend = sumF(mtdRows, 'spend');
  const leads = mtdRows.reduce((s, r) => s + normLeads(r), 0);
  const cpl = leads > 0 ? spend / leads : null;
  const impr = sumF(mtdRows, 'impressions');

  const pSpend = sumF(prevRows, 'spend');
  const pLeads = prevRows.reduce((s, r) => s + normLeads(r), 0);
  const pCpl = pLeads > 0 ? pSpend / pLeads : null;

  const sdelta = pSpend > 0 ? ((spend - pSpend) / pSpend) * 100 : null;
  const ldelta = pLeads > 0 ? ((leads - pLeads) / pLeads) * 100 : null;
  const cdelta = cpl && pCpl ? cpl - pCpl : null;

  // Year-to-date series, one point per month up to the current month.
  // Windsor's year_month field is formatted "YYYY|M" (e.g. "2026|5").
  const y = now.getFullYear();
  const ytdMonths = [];
  const ytdSpend = [];
  const ytdLeads = [];
  for (let mi = 1; mi <= now.getMonth() + 1; mi++) {
    const rows = ytdRows.filter((r) => r.year_month === `${y}|${mi}`);
    ytdMonths.push(MS[mi - 1]);
    ytdSpend.push(sumF(rows, 'spend'));
    ytdLeads.push(rows.reduce((s, r) => s + normLeads(r), 0));
  }

  // Top campaigns by spend (mirrors renderCampTable's slice(0,8)).
  const campaigns = [...campRows]
    .sort((a, b) => (parseFloat(b.spend) || 0) - (parseFloat(a.spend) || 0))
    .slice(0, 8)
    .map((r) => {
      const sp = parseFloat(r.spend) || 0;
      const ld = normLeads(r);
      return {
        campaign: r.campaign || 'Unknown',
        spend: sp,
        leads: ld,
        cpl: ld > 0 ? sp / ld : null,
      };
    });

  return {
    kpis: { spend, leads, cpl, impr, pSpend, pLeads, pCpl, sdelta, ldelta, cdelta },
    ytd: { months: ytdMonths, spend: ytdSpend, leads: ytdLeads },
    campaigns,
  };
}

// Top ads by spend, formatted for the AI note prompt (mirrors generateNotes()).
export function topAdsForNote(adRows, accountName) {
  const rows = acctRows(adRows, accountName);
  return [...rows]
    .sort((a, b) => (parseFloat(b.spend) || 0) - (parseFloat(a.spend) || 0))
    .slice(0, 8)
    .map((r) => {
      const ld = normLeads(r);
      const sp = parseFloat(r.spend) || 0;
      const cp = ld > 0 ? sp / ld : null;
      const ctr = parseFloat(r.ctr) || 0;
      return `"${r.ad_name || 'Unknown'}" — spend $${sp.toFixed(0)}, leads ${ld}, CPL ${
        cp ? '$' + cp.toFixed(0) : 'no leads'
      }, CTR ${(ctr * 100).toFixed(2)}%`;
    })
    .join('\n');
}
