// assets/js/api-compat.js
import { supabase } from './supabaseClient.js';

// Build a Supabase query from a simple options object
function buildQuery(table, opts = {}) {
  let q = supabase.from(table).select(opts.select || '*');

  // equality filters: { eq: { column: value, ... } }  or simply { where: { ... } }
  const eq = opts.eq || opts.where || {};
  for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);

  // IN filter: { in: { column: [a,b,c] } }
  if (opts.in) for (const [k, arr] of Object.entries(opts.in)) q = q.in(k, arr);

  // gt/gte/lt/lte filters: { gt: { col: v }, lte: { col: v } }
  for (const [op, fn] of Object.entries({ gt: 'gt', gte: 'gte', lt: 'lt', lte: 'lte' })) {
    if (opts[op]) for (const [k, v] of Object.entries(opts[op])) q = q[fn](k, v);
  }

  // order: 'created_at.desc' or { column: 'created_at', ascending: false }
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

// ---- API helpers ----
export async function apiGet(table, opts = {}) {
  const { data, error } = await buildQuery(table, opts);
  if (error) throw error;
  return data;
}

export async function apiInsert(table, rows) {
  const { data, error } = await supabase.from(table).insert(rows).select();
  if (error) throw error;
  return data;
}

export async function apiUpsert(table, rows, opts = {}) {
  const { data, error } = await supabase.from(table).upsert(rows, opts).select();
  if (error) throw error;
  return data;
}

export async function apiUpdate(table, values, match = {}) {
  let q = supabase.from(table).update(values);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data, error } = await q.select();
  if (error) throw error;
  return data;
}

export async function apiDelete(table, match = {}) {
  let q = supabase.from(table).delete();
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data, error } = await q.select();
  if (error) throw error;
  return data;
}

// Expose globals so legacy code like app.js can call them
window.apiGet = apiGet;
window.apiInsert = apiInsert;
window.apiUpsert = apiUpsert;
window.apiUpdate = apiUpdate;
window.apiDelete = apiDelete;

// Common aliases some codebases use
window.apiFetch = apiGet;
window.apiPost  = apiInsert;
window.apiPut   = apiUpdate;
window.apiPatch = apiUpdate;
