// assets/js/api-compat.js
import { supabase } from './supabaseClient.js';

// ---------- tiny query builder ----------
function buildSelect(resource, opts = {}) {
  let q = supabase.from(resource).select(opts.select || '*');

  const eq = opts.eq || opts.where || {};
  for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);

  if (opts.in) for (const [k, arr] of Object.entries(opts.in)) q = q.in(k, arr);

  for (const [op, fn] of Object.entries({ gt:'gt', gte:'gte', lt:'lt', lte:'lte' })) {
    if (opts[op]) for (const [k, v] of Object.entries(opts[op])) q = q[fn](k, v);
  }

  if (opts.order) {
    if (typeof opts.order === 'string') {
      const [col, dir] = opts.order.split('.');
      q = q.order(col, { ascending: dir !== 'desc' });
    } else {
      q = q.order(opts.order.column, { ascending: !!opts.order.ascending });
    }
  }
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.range && Array.isArray(opts.range)) q = q.range(opts.range[0], opts.range[1]);
  return q;
}

// ---------- GET ----------
export async function apiGet(resource, opts = {}) {
  try {
    // Special cases expected by legacy app
    if (resource === 'me') {
      const { data, error } = await buildSelect('me', opts);
      if (error) return { ok:false, error: error.message };
      return { ok:true, user: data?.[0] || null };
    }
    if (resource === 'list_circles') {
      const { data, error } = await buildSelect('list_circles', { order: 'created_at.desc', ...opts });
      if (error) return { ok:false, error: error.message };
      return { ok:true, circles: data || [] };
    }

    // Default: treat as table/view
    const { data, error } = await buildSelect(resource, opts);
    if (error) return { ok:false, error: error.message };
    return { ok:true, rows: data };
  } catch (e) {
    return { ok:false, error: e?.message || 'request_failed' };
  }
}

// ---------- POST (minimal endpoints the app calls now) ----------
export async function apiPost(resource, payload = {}) {
  try {
    // create_circle → insert into circles (map recitation_text => recitation)
    if (resource === 'create_circle') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ok:false, error:'unauthenticated' };
      const row = {
        owner_id: user.id,
        name: payload.name || payload['circle name'] || payload.title || 'Untitled',
        recitation: payload.recitation ?? payload.recitation_text ?? 'SubhanAllah',
        target_count: payload.target_count ? Number(payload.target_count) : null,
        starts_at: payload.starts_at || null,
        ends_at: payload.ends_at || null,
      };
      const { data, error } = await supabase.from('circles').insert(row).select().single();
      if (error) return { ok:false, error: error.message };
      return { ok:true, circle: data };
    }

    // increment → add to zikr_entries (no sessions yet, minimal)
    if (resource === 'increment') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ok:false, error:'unauthenticated' };
      const circleId = payload.circle_id || payload.circleId || null;
      const delta = Number(payload.delta || 1);
      if (!circleId) return { ok:false, error:'missing_circle_id' };
      const { error } = await supabase.from('zikr_entries').insert({
        circle_id: circleId, user_id: user.id, count: delta, method: 'tap'
      });
      if (error) return { ok:false, error: error.message };
      return { ok:true };
    }

    // Accept invite / start_session / get_session / close_session / reflect
    // Not implemented yet—return a clear stub so your UI can handle it.
    const notYet = new Set(['accept_invite','start_session','get_session','close_session','reflect','create_invite','signup']);
    if (notYet.has(resource)) return { ok:false, error:'endpoint_not_implemented' };

    // Default: insert into a table/view named by resource
    const { data, error } = await supabase.from(resource).insert(payload).select();
    if (error) return { ok:false, error: error.message };
    return { ok:true, rows: data };
  } catch (e) {
    return { ok:false, error: e?.message || 'request_failed' };
  }
}

// ---------- PUT/PATCH/DELETE (optional) ----------
export async function apiPut(table, values, match = {}) {
  let q = supabase.from(table).update(values);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data, error } = await q.select();
  if (error) return { ok:false, error: error.message };
  return { ok:true, rows: data };
}

export async function apiDelete(table, match = {}) {
  let q = supabase.from(table).delete();
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data, error } = await q.select();
  if (error) return { ok:false, error: error.message };
  return { ok:true, rows: data };
}

// expose globals for legacy code
window.apiGet = apiGet;
window.apiPost = apiPost;
window.apiPut = apiPut;
window.apiDelete = apiDelete;
window.apiFetch = apiGet;  // alias
