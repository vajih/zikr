// assets/js/api.js
import { supabase } from './supabaseClient.js';

const list = document.getElementById('circles-list');

// Render helper
function renderCircles(rows = []) {
  if (!list) return;
  list.innerHTML = rows.map(r => `
    <li data-circle="${r.id}">
      <strong>${r.name}</strong> — ${r.recitation} (target: ${r.target_count ?? '—'})
      <button data-add33 data-circle-id="${r.id}">+33</button>
    </li>
  `).join('') || '<li>No circles yet</li>';
}

// Query my circles (owner or member)
async function loadMyCircles() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('circles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('loadMyCircles error:', error);
    alert('Could not load circles. Check console.');
    return;
  }
  renderCircles(data);
}

// Insert a +33 zikr entry for a circle
async function add33(circleId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return alert('Please sign in first');

  const { error } = await supabase
    .from('zikr_entries')
    .insert({ circle_id: circleId, user_id: user.id, count: 33, method: 'tap' });

  if (error) {
    console.error('add33 error:', error);
    alert('Could not add zikr entry. Check console.');
    return;
  }
  alert('Added +33');
}

// React when auth becomes ready
document.addEventListener('supabase:authed', () => {
  loadMyCircles();
});

// Delegate clicks for +33 buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-add33]');
  if (!btn) return;
  add33(btn.dataset.circleId);
});

const createBtn = document.getElementById('btn-create-circle');
if (createBtn) {
  createBtn.addEventListener('click', async () => {
    const name = document.getElementById('new-circle-name')?.value?.trim();
    const rec = document.getElementById('new-circle-dhikr')?.value?.trim() || 'SubhanAllah';
    const target = Number(document.getElementById('new-circle-target')?.value || 0) || null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert('Please sign in first');

    const { error } = await supabase.from('circles').insert({
      owner_id: user.id, name, recitation: rec, target_count: target
    });
    if (error) { console.error(error); alert('Create failed'); return; }
    await loadMyCircles();
  });
}
