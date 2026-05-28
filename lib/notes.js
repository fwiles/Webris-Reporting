// Generates the daily "Webris Notes" creative analysis via the Anthropic API.
// Prompt ported from generateNotes() in portal_SGF.html. Uses prompt caching on the
// stable system instruction so repeated daily runs across clients reuse the cache.

import Anthropic from '@anthropic-ai/sdk';

const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MODEL = 'claude-opus-4-8';

const SYSTEM = `You are a creative strategist at Webris, a Facebook ads agency for law firms. You write sharp, specific creative analyses of monthly ad performance.

For each analysis:
- Write exactly 4 sentences. No bullet points, no filler phrases.
- Name actual ad titles from the data.
- Cover: (1) which creative angles or hooks are working and why, (2) which ads are wasting spend with poor CPL or no leads, (3) one specific creative improvement to test next.
- Be direct and concrete.`;

function fmtMoney(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
  return '$' + n.toFixed(0);
}

// Returns the note string, or null if generation fails / no key (caller stores null
// and the page degrades gracefully).
export async function generateNote({ displayName, kpis, topAds, now = new Date() }) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const cur = MN[now.getMonth()];
    const prev = MN[now.getMonth() === 0 ? 11 : now.getMonth() - 1];

    const userPrompt = `Analyze the ad performance for ${displayName} for ${cur} ${now.getFullYear()}.

Overall: Spend ${fmtMoney(kpis.spend)}, ${kpis.leads} leads, CPL ${kpis.cpl ? '$' + kpis.cpl.toFixed(0) : 'N/A'}. vs ${prev}: leads ${kpis.ldelta != null ? kpis.ldelta.toFixed(0) + '%' : 'N/A'}, CPL ${kpis.cdelta != null ? '$' + kpis.cdelta.toFixed(0) + ' change' : 'N/A'}.

Individual ads this month:
${topAds || 'No ad-level data available.'}`;

    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return text || null;
  } catch (e) {
    console.error('generateNote failed:', e.message);
    return null;
  }
}
