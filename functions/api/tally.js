import { ensureSchema, json } from '../../lib/shared.js';

// Public tally. Only real creatures are listed by name, and only once at least two answers agree,
// so one-off abuse that slips past the judge never reaches the public list. Hidden names never show.
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: 'database not connected' }, 500);
  await ensureSchema(env.DB);
  const [tot, list] = await env.DB.batch([
    env.DB.prepare('SELECT verdict, SUM(n) AS n FROM counts GROUP BY verdict'),
    env.DB.prepare(`SELECT label AS name, n FROM counts WHERE verdict = 'creature' AND n >= 2
                    AND key NOT IN (SELECT name FROM hidden) ORDER BY n DESC LIMIT 40`),
  ]);
  const t = Object.fromEntries((tot.results || []).map(r => [r.verdict, r.n || 0]));
  return json({ slain: t.creature || 0, forbidden: t.forbidden || 0, unknown: t.unknown || 0, creatures: list.results || [] },
    200, { 'cache-control': 'public, max-age=15' });
}
