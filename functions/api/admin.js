import { ensureSchema, json, isAdmin } from '../../lib/shared.js';

// Private lists for the game's owner. Requires the ADMIN_PASSWORD secret, sent as the x-admin-key header.
export async function onRequestGet({ request, env }) {
  if (!isAdmin(request, env)) return json({ error: 'wrong password' }, 401);
  await ensureSchema(env.DB);
  const type = new URL(request.url).searchParams.get('type') || 'forbidden';
  if (type === 'recent') {
    const r = await env.DB.prepare('SELECT text, verdict, name, created FROM answers ORDER BY id DESC LIMIT 200').all();
    return json({ rows: r.results || [] });
  }
  if (!['forbidden', 'unknown', 'creature'].includes(type)) return json({ error: 'bad type' }, 400);
  const r = await env.DB.prepare(`SELECT c.label, c.key, c.n, c.last, (h.name IS NOT NULL) AS hidden
                                  FROM counts c LEFT JOIN hidden h ON h.name = c.key
                                  WHERE c.verdict = ? ORDER BY c.n DESC, c.last DESC LIMIT 1000`).bind(type).all();
  return json({ rows: r.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!isAdmin(request, env)) return json({ error: 'wrong password' }, 401);
  await ensureSchema(env.DB);
  let b; try { b = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const name = String(b?.name || '').slice(0, 60);
  if (!name) return json({ error: 'no name' }, 400);
  if (b.action === 'hide') await env.DB.prepare('INSERT OR IGNORE INTO hidden (name) VALUES (?)').bind(name).run();
  else if (b.action === 'unhide') await env.DB.prepare('DELETE FROM hidden WHERE name = ?').bind(name).run();
  else if (b.action === 'forbid') {      // move a wrongly accepted creature to the forbidden list for good
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO hidden (name) VALUES (?)').bind(name),
      env.DB.prepare(`UPDATE cache SET verdict = 'forbidden', name = '' WHERE verdict = 'creature' AND name = ?`).bind(name),
    ]);
  } else return json({ error: 'bad action' }, 400);
  return json({ ok: true });
}
