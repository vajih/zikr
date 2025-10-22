// ======================= helpers =======================
const $ = (s) => document.querySelector(s);

// Simple section switcher; exposed so inline code can call show('create')
window.show = function (id) {
  document.querySelectorAll('main > section').forEach((sec) => (sec.hidden = true));
  const el = document.getElementById(id);
  if (el) el.hidden = false;
};

// ======================= app state =====================
let YOU = 0;
let POLL_ID = null;
let CUR_SESSION = null;
let LIVE = { session_id: null, circle_id: null, target: 0, circleName: '' };

// =================== invites & join ====================
function inviteUrlFromToken(tok) {
  // Works for / and /index.html
  const base = location.origin + location.pathname.replace(/index\.html$/i, '');
  return `${base}?join=${encodeURIComponent(tok)}`;
}

// Optional share toast if present; otherwise fallback to alert
function showInviteToast(url) {
  const toast = document.getElementById('inviteToast');
  if (!toast) {
    alert('Invite link ready:\n\n' + url + '\n\n(Copied to clipboard if permitted.)');
    return;
  }
  const urlInput = toast.querySelector('.invite-url');
  const copied = toast.querySelector('.copied');
  if (urlInput) urlInput.value = url;
  if (copied) copied.textContent = 'The unique link is copied. Paste it into WhatsApp, text, or email.';

  const copyBtn = toast.querySelector('.copyBtn');
  if (copyBtn)
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        if (copied) copied.textContent = 'Copied again ✔';
      } catch (_) {}
    };

  const waBtn = toast.querySelector('.waBtn');
  if (waBtn) {
    waBtn.setAttribute('href', 'https://wa.me/?text=' + encodeURIComponent('Join my Zikr Circle:\n' + url));
    waBtn.setAttribute('target', '_blank');
    waBtn.setAttribute('rel', 'noopener');
  }

  const smsBtn = toast.querySelector('.smsBtn');
  if (smsBtn) smsBtn.setAttribute('href', 'sms:?&body=' + encodeURIComponent('Join my Zikr Circle: ' + url));

  const emailBtn = toast.querySelector('.emailBtn');
  if (emailBtn)
    emailBtn.setAttribute(
      'href',
      'mailto:?subject=' +
        encodeURIComponent('Join my Zikr Circle') +
        '&body=' +
        encodeURIComponent('Assalamu alaikum,\nJoin our dhikr circle here:\n' + url + '\n\n— sent via Zikr Circle')
    );

  const closeBtn = document.getElementById('inviteToastClose');
  if (closeBtn) closeBtn.onclick = () => {
    toast.hidden = true;
  };

  toast.hidden = false;
}

async function createInvite(circle_id) {
  const r = await apiPost('create_invite', { token: Auth.getToken(), circle_id });
  if (!(r && r.ok)) {
    alert('Could not create invite: ' + (r && r.error ? r.error : 'unknown'));
    return;
  }
  const url = inviteUrlFromToken(r.invite_token);

  // Prefer native share on mobile (no-op if user cancels)
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Join my Zikr Circle', text: 'Tap to join our dhikr circle.', url });
      return;
    }
  } catch (_) {}

  try {
    await navigator.clipboard.writeText(url);
  } catch (_) {}
  showInviteToast(url);
}

async function acceptInvite(token) {
  const r = await apiPost('accept_invite', { token: Auth.getToken(), invite_token: token });
  const el = document.getElementById('joinStatus');
  if (r && r.ok) {
    if (el) el.textContent = 'Joined! See My Circles.';
    show('myCircles');
    await refreshCircles();
  } else {
    if (el) el.textContent = 'Join failed: ' + (r && r.error ? r.error : 'unknown');
  }
}

// ======== circles (list + progress) & sessions =========
async function refreshCircles() {
  const { ok, circles } = await apiGet('list_circles', { token: Auth.getToken() });
  const ul = document.getElementById('listCircles');
  if (!ul) return;
  ul.innerHTML = '';

  if (!ok || !circles || !circles.length) {
    ul.innerHTML = '<li>No circles yet.</li>';
    return;
  }

  circles.forEach((c) => {
    // Use cumulative totals if available; fall back to last-session values
    const percentTotal  = Number((c.total_pct ?? c.progress_pct) || 0);
    const completedTot  = Number((c.total_completed ?? c.completed_count) || 0);
    const targetTotal   = Number((c.total_target ?? c.current_target ?? c.target_count) || 0);

    // Keep last-session for the small secondary line
    const percentLast   = Number(c.progress_pct || 0);
    const completedLast = Number(c.completed_count || 0);
    const targetLast    = Number((c.current_target ?? c.target_count) || 0);

    const isOpen = String(c.session_status || '').toLowerCase() === 'open';

    // Main line shows cumulative progress (what you wanted to see move)
    const mainLabel =
      targetTotal > 0
        ? `${isOpen ? 'Active' : 'Total'} • ${completedTot} / ${targetTotal} (${percentTotal}%)`
        : `No sessions yet`;

    // Optional secondary “last round” line (omit if you don’t want it)
    const lastLine =
      targetLast > 0 ? `<div class="card-meta">Last • ${completedLast} / ${targetLast} (${percentLast}%)</div>` : '';

    const li = document.createElement('li');
    li.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
        <div style="flex:1; min-width:0;">
          <strong>${c.name}</strong><br>
          <small>${(c.recitation_text || '').slice(0,80)}</small>
          <div class="progress" role="progressbar" aria-label="Progress toward target"
               aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentTotal}">
            <span class="bar" style="width:${percentTotal}%;"></span>
          </div>
          <div class="card-meta">${mainLabel}</div>
          ${lastLine}
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; min-width:140px; flex-shrink:0;">
          <button class="startBtn">Start</button>
          <button class="inviteBtn">Invite</button>
        </div>
      </div>
    `;

    // Start a new session (kept as-is)
    const startBtn = li.querySelector('.startBtn');
    if (startBtn)
      startBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const resp = await apiPost('start_session', {
          token: Auth.getToken(),
          circle_id: c.id,
          // Use the circle's target by default for a new round
          target_count: Number(c.target_count || c.current_target || 0)
        });
        if (resp.ok) startLive(resp.session_id);
      });

    // Create invite (kept as-is)
    const inviteBtn = li.querySelector('.inviteBtn');
    if (inviteBtn)
      inviteBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        createInvite(c.id);
      });

    ul.appendChild(li);
  });
}

function onGoalReached() {
  if (POLL_ID) {
    clearInterval(POLL_ID);
    POLL_ID = null;
  }
  const tap = document.getElementById('btnTasbih');
  if (tap) tap.disabled = true;

  // disable manual controls too
  const manualInp = document.getElementById('manualDelta');
  const manualBtn = document.getElementById('btnAddManual');
  if (manualInp) manualInp.disabled = true;
  if (manualBtn) manualBtn.disabled = true;

  show('session');
  const complete = document.getElementById('complete');
  if (complete) complete.hidden = false;
}

async function startLive(session_id) {
  CUR_SESSION = session_id;
  YOU = 0;
  show('session');

  const complete = document.getElementById('complete');
  if (complete) complete.hidden = true;

  // re-enable manual controls on new session
  const manualInp = document.getElementById('manualDelta');
  const manualBtn = document.getElementById('btnAddManual');
  const manualStatus = document.getElementById('manualStatus');
  if (manualInp) manualInp.disabled = false;
  if (manualBtn) manualBtn.disabled = false;
  if (manualStatus) manualStatus.textContent = '';

  const info = await apiGet('get_session', { token: Auth.getToken(), session_id });
  if (info && info.ok) {
    LIVE = {
      session_id,
      circle_id: info.session.circle_id,
      target: Number(info.session.target_count) || 0,
      circleName: info.circle.name,
    };
    const t1 = document.getElementById('sessionTitle');
    const t2 = document.getElementById('target');
    const c1 = document.getElementById('circleCount');
    const y1 = document.getElementById('youCount');
    if (t1) t1.textContent = LIVE.circleName;
    if (t2) t2.textContent = LIVE.target;
    if (c1) c1.textContent = info.session.completed_count;
    if (y1) y1.textContent = YOU;

    if (String(info.session.status) === 'completed' || info.session.completed_count >= LIVE.target) {
      onGoalReached();
    }
  }

  if (POLL_ID) clearInterval(POLL_ID);
  POLL_ID = setInterval(async () => {
    if (!CUR_SESSION) return;
    const s = await apiGet('get_session', { token: Auth.getToken(), session_id: CUR_SESSION });
    if (s && s.ok) {
      const c1 = document.getElementById('circleCount');
      if (c1) c1.textContent = s.session.completed_count;
      if (String(s.session.status) === 'completed' || s.session.completed_count >= LIVE.target) {
        onGoalReached();
      }
    }
  }, 1500);
}

async function increment() {
  if (!CUR_SESSION) return;
  YOU += 1;
  const y1 = document.getElementById('youCount');
  if (y1) y1.textContent = YOU;

  const r = await apiPost('increment', { token: Auth.getToken(), session_id: CUR_SESSION, delta: 1 });
  if (r && r.ok) {
    const c1 = document.getElementById('circleCount');
    if (c1) c1.textContent = r.completed_count;
    if (r.goal_reached) onGoalReached();
  } else if (r && r.error === 'session_closed') {
    onGoalReached();
  }
}

// Manual +N add (for offline recitations)
async function addManual() {
  if (!CUR_SESSION) return;
  const input = document.getElementById('manualDelta');
  const status = document.getElementById('manualStatus');
  const btn = document.getElementById('btnAddManual');

  const raw = (input && input.value) ? input.value.trim() : '';
  const val = parseInt(raw, 10);

  // basic validation
  if (!Number.isFinite(val) || val <= 0) {
    if (status) status.textContent = 'Enter a positive whole number.';
    return;
  }
  if (val > 100000) { // sanity guard
    if (status) status.textContent = 'That seems too large. Try a smaller number.';
    return;
  }

  if (btn) btn.disabled = true;

  // optimistic UI: update "You" immediately
  YOU += val;
  const y1 = document.getElementById('youCount');
  if (y1) y1.textContent = YOU;

  // send to backend as a delta
  const r = await apiPost('increment', { token: Auth.getToken(), session_id: CUR_SESSION, delta: val });
  if (r && r.ok) {
    const c1 = document.getElementById('circleCount');
    if (c1) c1.textContent = r.completed_count;
    if (status) status.textContent = `Added +${val}.`;
    if (input) input.value = '';
    if (r.goal_reached) onGoalReached();
  } else if (r && r.error === 'session_closed') {
    if (status) status.textContent = 'Session already closed.';
    onGoalReached();
    // rollback YOU since it didn't apply
    YOU -= val;
    const y2 = document.getElementById('youCount');
    if (y2) y2.textContent = YOU;
  } else {
    // rollback YOU if server failed
    YOU -= val;
    const y2 = document.getElementById('youCount');
    if (y2) y2.textContent = YOU;
    if (status) status.textContent = 'Could not add—please try again.';
  }

  if (btn) btn.disabled = false;
}

async function closeSession() {
  if (!CUR_SESSION) return;
  await apiPost('close_session', { token: Auth.getToken(), session_id: CUR_SESSION });
  clearInterval(POLL_ID);
  POLL_ID = null;
  CUR_SESSION = null;
  show('myCircles');
  await refreshCircles();
}

// ================== reflections / complete ==================
async function saveReflection(e) {
  e.preventDefault();
  const txt = new FormData(e.target).get('text') || '';
  const lbl = document.getElementById('reflectStatus');
  if (!txt.trim()) {
    if (lbl) lbl.textContent = 'Saved (empty)';
    return;
  }
  const r = await apiPost('reflect', { token: Auth.getToken(), session_id: LIVE.session_id, text: txt, visibility: 'circle' });
  if (lbl) lbl.textContent = r && r.ok ? 'Reflection saved.' : 'Could not save reflection.';
}

async function startAnother() {
  const resp = await apiPost('start_session', { token: Auth.getToken(), circle_id: LIVE.circle_id, target_count: LIVE.target });
  if (resp && resp.ok) startLive(resp.session_id);
}

function doneComplete() {
  CUR_SESSION = null;
  show('myCircles');
  refreshCircles();
}

// ======================= boot ==========================
window.addEventListener('DOMContentLoaded', async () => {
  // nav
  const btnCreate = document.getElementById('btnShowCreate');
  const btnJoin = document.getElementById('btnShowJoin');
  const btnMy = document.getElementById('btnShowMy');
  if (btnCreate) btnCreate.onclick = () => show('create');
  if (btnJoin) btnJoin.onclick = () => show('join');
  if (btnMy) btnMy.onclick = () => {
    show('myCircles');
    refreshCircles();
  };

  // optional sign out
  const btnSignOut = document.getElementById('btnSignOut');
  if (btnSignOut) btnSignOut.onclick = () => {
    localStorage.removeItem('zikr_token');
    show('auth');
  };

  // -------- signup (idempotent; duplicate-email modal) --------
  const formSignup = document.getElementById('formSignup');
  if (formSignup) {
    formSignup.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const email = (f.get('email') || '').toString().trim().toLowerCase();
      const name = (f.get('name') || '').toString().trim();

      try {
        const r = await apiPost('signup', { email, name });

        if (r && r.ok) {
          // Existing account → show modal
          if (r.existed) {
            const modal = document.getElementById('dupeModal');
            const emailSpan = document.getElementById('dupeEmail');
            if (emailSpan) emailSpan.textContent = (r.user && r.user.email) || email;
            if (modal) modal.hidden = false;

            const btnContinue = document.getElementById('btnDupeContinue');
            if (btnContinue) {
              btnContinue.onclick = async () => {
                Auth.setToken(r.token);
                if (modal) modal.hidden = true;
                const as = document.getElementById('authStatus');
                if (as) as.textContent = 'Welcome back. Signed in.';
                apiGet('me', { token: Auth.getToken() }).then((me) => {
                  if (me && me.ok && me.user && me.user.name) {
                    const h1 = document.querySelector('header h1');
                    if (h1) h1.textContent = `Zikr Circle — ${me.user.name}`;
                  }
                });
                const pending = localStorage.getItem('pending_join');
                if (pending) {
                  localStorage.removeItem('pending_join');
                  show('join');
                  const input = document.querySelector('[name="invite_token"]');
                  if (input) input.value = pending;
                  await acceptInvite(pending);
                } else {
                  show('myCircles');
                  refreshCircles();
                }
              };
            }

            const btnChange = document.getElementById('btnDupeChange');
            if (btnChange) {
              btnChange.onclick = () => {
                const modal2 = document.getElementById('dupeModal');
                if (modal2) modal2.hidden = true;
                const emailInput = document.querySelector('#formSignup [name="email"]');
                if (emailInput) {
                  emailInput.focus();
                  emailInput.select();
                }
                const as = document.getElementById('authStatus');
                if (as) as.textContent = 'Try a different email.';
              };
            }

            return; // handled via modal
          }

          // New user flow
          Auth.setToken(r.token);
          const as = document.getElementById('authStatus');
          if (as) as.textContent = 'Signed in. Token saved.';
          if (typeof window.show === 'function') window.show('create');

          apiGet('me', { token: Auth.getToken() }).then((me) => {
            if (me && me.ok && me.user && me.user.name) {
              const h1 = document.querySelector('header h1');
              if (h1) h1.textContent = `Zikr Circle — ${me.user.name}`;
            }
          });

          const pending = localStorage.getItem('pending_join');
          if (pending) {
            localStorage.removeItem('pending_join');
            show('join');
            const input = document.querySelector('[name="invite_token"]');
            if (input) input.value = pending;
            await acceptInvite(pending);
          }
        } else {
          const as = document.getElementById('authStatus');
          if (as) as.textContent = r && r.error ? `Error: ${r.error}` : 'Error signing in.';
        }
      } catch (err) {
        console.error('Signup failed', err);
        const as = document.getElementById('authStatus');
        if (as) as.textContent = 'Network or server error signing in. See console.';
      }
    });
  }

  // -------- create circle --------
  const formCreate = document.getElementById('formCreateCircle');
  if (formCreate) {
    formCreate.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const payload = Object.fromEntries(f.entries());
      try {
        const r = await apiPost('create_circle', { token: Auth.getToken(), ...payload });
        const cs = document.getElementById('createStatus');
        if (r && r.ok) {
          if (cs) cs.textContent = 'Circle created.';
          show('myCircles');
          refreshCircles();
        } else {
          if (cs) cs.textContent = r && r.error ? `Error: ${r.error}` : 'Error creating circle.';
        }
      } catch (err) {
        console.error('Create circle failed', err);
        const cs = document.getElementById('createStatus');
        if (cs) cs.textContent = 'Network or server error creating circle. See console.';
      }
    });
  }

  // -------- join by token form --------
  const formJoin = document.getElementById('formJoin');
  if (formJoin) {
    formJoin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tok = new FormData(e.target).get('invite_token');
      if (Auth.isAuthed()) {
        await acceptInvite(tok);
      } else {
        localStorage.setItem('pending_join', tok);
        show('auth');
      }
    });
  }

  // tasbih + close session
  const btnTasbih = document.getElementById('btnTasbih');
  if (btnTasbih) btnTasbih.onclick = increment;
  const btnClose = document.getElementById('btnClose');
  if (btnClose) btnClose.onclick = closeSession;

  // manual add
  const btnAddManual = document.getElementById('btnAddManual');
  if (btnAddManual) btnAddManual.onclick = addManual;

  // allow Enter to submit manual add
  const manualInp = document.getElementById('manualDelta');
  if (manualInp) {
    manualInp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addManual(); }
    });
  }

  // deep-link: ?join=TOKEN
  const joinToken = new URLSearchParams(location.search).get('join');
  if (joinToken) {
    const input = document.querySelector('[name="invite_token"]');
    if (input) input.value = joinToken;
    if (Auth.isAuthed()) {
      show('join');
      await acceptInvite(joinToken);
    } else {
      localStorage.setItem('pending_join', joinToken);
      show('auth');
    }
  }

  // completion panel handlers (if present)
  const formReflect = document.getElementById('formReflect');
  if (formReflect) formReflect.addEventListener('submit', saveReflection);
  const btnAnother = document.getElementById('btnAnother');
  if (btnAnother) btnAnother.onclick = startAnother;
  const btnDone = document.getElementById('btnDone');
  if (btnDone) btnDone.onclick = doneComplete;

  // if already authed, personalize and load circles
  if (Auth.isAuthed()) {
    apiGet('me', { token: Auth.getToken() }).then((me) => {
      if (me && me.ok && me.user && me.user.name) {
        const h1 = document.querySelector('header h1');
        if (h1) h1.textContent = `Zikr Circle — ${me.user.name}`;
      }
    });
    show('myCircles');
    refreshCircles();
  } else {
    show('auth');
  }
});

// assets/js/app.js
import { supabase } from './supabaseClient.js';

async function testSupabase() {
  // Simple call—if your 'circles' table exists, this will return rows.
  // If it doesn't exist yet, you'll still see a successful network call but with an error explaining the table is missing.
  const { data, error } = await supabase
    .from('circles')
    .select('*')
    .limit(1);

  console.log('Supabase connection test →', { data, error });
}

document.addEventListener('DOMContentLoaded', testSupabase);
