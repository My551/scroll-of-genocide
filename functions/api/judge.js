import { ensureSchema, judge, whoIs, json, norm } from '../../lib/shared.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'database not connected' }, 500);
  let body; try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const text = String(body?.answer ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!text) return json({ error: 'empty answer' }, 400);
  await ensureSchema(env.DB);

  const who = await whoIs(request, env), now = Date.now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM answers WHERE who = ? AND created > ?').bind(who, now - 60_000).first();
  if ((recent?.n || 0) >= 12) return json({ error: 'too many answers, slow down' }, 429);

  const v = await judge(env, text);
  const key = v.verdict === 'creature' ? v.name : norm(text);
  const label = v.verdict === 'creature' ? v.name : text;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO answers (text, norm, verdict, name, created, who) VALUES (?, ?, ?, ?, ?, ?)').bind(text, norm(text), v.verdict, v.name, now, who),
    env.DB.prepare(`INSERT INTO counts (verdict, key, label, n, last) VALUES (?, ?, ?, 1, ?)
                    ON CONFLICT (verdict, key) DO UPDATE SET n = n + 1, last = excluded.last, label = excluded.label`).bind(v.verdict, key, label, now),
  ]);
  return json({ verdict: v.verdict, name: v.name });
}
