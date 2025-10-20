// ---------- helpers ----------
const $ = (s) => document.querySelector(s);

// simple section switcher; exposed so other code can call show('create')
window.show = function (id) {
  document.querySelectorAll('main > section').forEach(sec => (sec.hidden = true));
  const el = document.getElementById(id);
  if (el) el.hidden = false;
};

// ---------- state ----------
let YOU = 0;
let POLL_ID = null;
let CUR_SESSION = null;

// ---------- API wrappers (api.js + auth.js must be loaded before this) ----------
// expects: apiGet(action, params), apiPost(action, payload), Auth.getToken(), Auth.setToken(), Auth.isAuthed()

// ---------- invites & join ----------
function inviteUrlFromToken(tok) {
  // Works on GitHub Pages whether URL ends with / or /index.html
  const base = location.origin + location.pathname.replace(/index\.html$/i, '');
  return `${base}?join=${encodeURIComponent(tok)}`;
}

function inviteUrlFromToken(tok){
  const base = location.origin + location.pathname.replace(/index\.html$/i, '');
  return `${base}?join=${encodeURIComponent(tok)}`;
}

function showInviteToast(url){
  const toast = document.getElementById('inviteToast');
  const urlInput = toast.querySelector('.invite-url');
  const copied = toast.querySelector('.copied');

  // set the URL
  urlInput.value = url;
  copied.textContent = 'The unique link is copied to your clipboard. Paste it into WhatsApp, text, or email.';

  // buttons
  toast.querySelector('.copyBtn').onclick = async ()=>{
    try { await navigator.clipboard.writeText(url); copied.textContent = 'Copied again ✔'; } catch(_) {}
  };
  toast.querySelector('.waBtn').setAttribute('href',
    'https://wa.me/?text=' + encodeURIComponent('Join my Zikr Circle:\n' + url)
  );
  toast.querySelector('.waBtn').setAttribute('target', '_blank');
  toast.querySelector('.waBtn').setAttribute('rel', 'noopener');

  toast.querySelector('.smsBtn').setAttribute('href',
    'sms:?&body=' + encodeURIComponent('Join my Zikr Circle: ' + url)
  );
  toast.querySelector('.emailBtn').setAttribute('href',
    'mailto:?subject=' + encodeURIComponent('Join my Zikr Circle') +
    '&body=' + encodeURIComponent('Assalamu alaikum,\nJoin our dhikr circle here:\n' + url + '\n\n— sent via Zikr Circle')
  );

  document.getElementById('inviteToastClose').onclick = ()=> toast.hidden = true;
  toast.hidden = false;
}

async function createInvite(circle_id){
  const r = await apiPost('create_invite', { token: Auth.getToken(), circle_id });
  if(!(r && r.ok)){ alert('Could not create invite: ' + (r && r.error ? r.error : 'unknown')); return; }

  const url = inviteUrlFromToken(r.invite_token);

  // 1) Try native share on phones (best UX)
  try{
    if (navigator.share) {
      await navigator.share({
        title: 'Join my Zikr Circle',
        text: 'Tap to join our dhikr circle.',
        url
      });
      return; // shared; nothing else to do
    }
  }catch(_){ /* user canceled share; fall through to panel */ }

  // 2) Copy to clipboard
  try { await navigator.clipboard.writeText(url); } catch(_) {}

  // 3) Show clear instructions + quick-share buttons
  showInviteToast(url);
}


async function acceptInvite(token) {
  const r = await apiPost('accept_invite', { token: Auth.getToken(), invite_token: token });
  const el = $('#joinStatus');
  if (r && r.ok) {
    if (el) el.textContent = 'Joined! See My Circles.';
    show('myCircles');
    await refreshCircles();
  } else {
    if (el) el.textContent = 'Join failed: ' + (r && r.error ? r.error : 'unknown');
  }
}

// ---------- circles & sessions ----------
async function refreshCircles() {
  const { ok, circles } = await apiGet('list_circles', { token: Auth.getToken() });
  const ul = $('#listCircles');
  if (!ul) return;
  ul.innerHTML = '';

  if (!ok || !circles || !circles.length) {
    ul.innerHTML = '<li>No circles yet.</li>';
    return;
  }

  circles.forEach(c => {
    const percent = Number(c.progress_pct || 0);
    const completed = Number(c.completed_count || 0);
    const target = Number(c.current_target || c.target_count || 0);
    const status = (c.session_status || '').toLowerCase();

    const statusLabel =
        status === 'open'
        ? `Active • ${completed} / ${target} (${percent}%)`
        : (target > 0
            ? (percent >= 100 ? `Completed • ${target} / ${target} (100%) ✓`
                                : `Last • ${completed} / ${target} (${percent}%)`)
            : `No sessions yet`);

    const li = document.createElement('li');
    li.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
        <div style="flex:1; min-width:0;">
            <strong>${c.name}</strong><br>
            <small>${(c.recitation_text || '').slice(0,80)}</small>
            <div class="progress" role="progressbar" aria-label="Progress toward target"
                aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
            <span class="bar" style="width:${percent}%;"></span>
            </div>
            <div class="card-meta">${statusLabel}</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; min-width:140px; flex-shrink:0;">
            <button class="startBtn">Start</button>
            <button class="inviteBtn">Invite</button>
        </div>
        </div>
    `;

    li.querySelector('.startBtn').addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const resp = await apiPost('start_session', {
        token: Auth.getToken(),
        circle_id: c.id,
        target_count: target
        });
        if (resp.ok) startLive(resp.session_id);
    });

    li.querySelector('.inviteBtn').addEventListener('click', (ev) => {
        ev.stopPropagation();
        createInvite(c.id);
    });

    ul.appendChild(li);
    });

}

async function startLive(session_id) {
  CUR_SESSION = session_id;
  YOU = 0;
  show('session');

  const info = await apiGet('get_session', { token: Auth.getToken(), session_id });
  if (info && info.ok) {
    $('#sessionTitle').textContent = info.circle.name;
    $('#target').textContent = info.session.target_count;
    $('#circleCount').textContent = info.session.completed_count;
    $('#youCount').textContent = YOU;
  }

  if (POLL_ID) clearInterval(POLL_ID);
  POLL_ID = setInterval(async () => {
    if (!CUR_SESSION) return;
    const s = await apiGet('get_session', { token: Auth.getToken(), session_id: CUR_SESSION });
    if (s && s.ok) $('#circleCount').textContent = s.session.completed_count;
  }, 1500);
}

async function increment() {
  YOU += 1;
  $('#youCount').textContent = YOU;
  const r = await apiPost('increment', { token: Auth.getToken(), session_id: CUR_SESSION, delta: 1 });
  if (r && r.ok) $('#circleCount').textContent = r.completed_count;
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

// ---------- boot ----------
window.addEventListener('DOMContentLoaded', async () => {
  // inside DOMContentLoaded:
const formReflect = document.getElementById('formReflect');
if (formReflect) formReflect.addEventListener('submit', saveReflection);
const btnAnother = document.getElementById('btnAnother');
if (btnAnother) btnAnother.onclick = startAnother;
const btnDone = document.getElementById('btnDone');
if (btnDone) btnDone.onclick = doneComplete;
  
  // nav
  const btnCreate = $('#btnShowCreate');
  const btnJoin = $('#btnShowJoin');
  const btnMy = $('#btnShowMy');
  if (btnCreate) btnCreate.onclick = () => show('create');
  if (btnJoin) btnJoin.onclick = () => show('join');
  if (btnMy) btnMy.onclick = () => { show('myCircles'); refreshCircles(); };

  // sign out (optional button if you added one to index.html)
  const btnSignOut = $('#btnSignOut');
  if (btnSignOut) btnSignOut.onclick = () => { localStorage.removeItem('zikr_token'); show('auth'); };

  // signup
  const formSignup = $('#formSignup');
  if (formSignup) {
    formSignup.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const r = await apiPost('signup', { email: f.get('email'), name: f.get('name') });
        if (r && r.ok) {
          Auth.setToken(r.token);
          $('#authStatus').textContent = 'Signed in. Token saved.';
          if (typeof window.show === 'function') window.show('create');

          // personalize header (optional)
          apiGet('me', { token: Auth.getToken() }).then(me => {
            if (me && me.ok && me.user && me.user.name) {
              const h1 = document.querySelector('header h1');
              if (h1) h1.textContent = `Zikr Circle — ${me.user.name}`;
            }
          });

          // auto-accept pending join if present
          const pending = localStorage.getItem('pending_join');
          if (pending) {
            localStorage.removeItem('pending_join');
            show('join');
            const input = document.querySelector('[name="invite_token"]');
            if (input) input.value = pending;
            await acceptInvite(pending);
          }
        } else {
          $('#authStatus').textContent = r && r.error ? `Error: ${r.error}` : 'Error signing in.';
        }
      } catch (err) {
        console.error('Signup failed', err);
        $('#authStatus').textContent = 'Network or server error signing in. See console.';
      }
    });
  }

  // create circle
  const formCreate = $('#formCreateCircle');
  if (formCreate) {
    formCreate.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const payload = Object.fromEntries(f.entries());
      try {
        const r = await apiPost('create_circle', { token: Auth.getToken(), ...payload });
        if (r && r.ok) {
          $('#createStatus').textContent = 'Circle created.';
          show('myCircles');
          refreshCircles();
        } else {
          $('#createStatus').textContent = r && r.error ? `Error: ${r.error}` : 'Error creating circle.';
        }
      } catch (err) {
        console.error('Create circle failed', err);
        $('#createStatus').textContent = 'Network or server error creating circle. See console.';
      }
    });
  }

  // join by token form
  const formJoin = $('#formJoin');
  if (formJoin) {
    formJoin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tok = new FormData(e.target).get('invite_token');
      if (Auth.isAuthed()) {
        await acceptInvite(tok);
      } else {
        // save for after signup
        localStorage.setItem('pending_join', tok);
        show('auth');
      }
    });
  }

  // tasbih + close session
  const btnTasbih = $('#btnTasbih');
  if (btnTasbih) btnTasbih.onclick = increment;
  const btnClose = $('#btnClose');
  if (btnClose) btnClose.onclick = closeSession;

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

  // if already authed, personalize and load circles
  if (Auth.isAuthed()) {
    apiGet('me', { token: Auth.getToken() }).then(me => {
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

// if Goal Reached //
function onGoalReached() {
  // stop polling and disable the tap button
  if (POLL_ID) { clearInterval(POLL_ID); POLL_ID = null; }
  const tap = document.getElementById('btnTasbih');
  if (tap) tap.disabled = true;

  // show completion panel
  show('session'); // ensure we’re on session screen
  document.getElementById('complete').hidden = false;
}

// keep a little live context
let LIVE = { session_id:null, circle_id:null, target:0, circleName:'' };

async function startLive(session_id) {
  CUR_SESSION = session_id; YOU = 0; show('session');
  document.getElementById('complete').hidden = true;
  const info = await apiGet('get_session', { token: Auth.getToken(), session_id });
  if (info && info.ok) {
    LIVE = {
      session_id,
      circle_id: info.session.circle_id,
      target: Number(info.session.target_count) || 0,
      circleName: info.circle.name
    };
    $('#sessionTitle').textContent = LIVE.circleName;
    $('#target').textContent = LIVE.target;
    $('#circleCount').textContent = info.session.completed_count;
    $('#youCount').textContent = YOU;

    // if session already completed (e.g., re-open), show completion
    if (String(info.session.status) === 'completed' || info.session.completed_count >= LIVE.target) {
      onGoalReached();
    }
  }

  if (POLL_ID) clearInterval(POLL_ID);
  POLL_ID = setInterval(async ()=>{
    if (!CUR_SESSION) return;
    const s = await apiGet('get_session', { token: Auth.getToken(), session_id: CUR_SESSION });
    if (s && s.ok) {
      $('#circleCount').textContent = s.session.completed_count;
      if (String(s.session.status) === 'completed' || s.session.completed_count >= LIVE.target) {
        onGoalReached();
      }
    }
  }, 1500);
}

async function increment() {
  if (!CUR_SESSION) return;
  YOU += 1; $('#youCount').textContent = YOU;
  const r = await apiPost('increment', { token: Auth.getToken(), session_id: CUR_SESSION, delta: 1 });
  if (r && r.ok) {
    $('#circleCount').textContent = r.completed_count;
    if (r.goal_reached) onGoalReached();
  } else if (r && r.error === 'session_closed') {
    onGoalReached();
  }
}

// reflection save
async function saveReflection(e) {
  e.preventDefault();
  const txt = new FormData(e.target).get('text') || '';
  if (!txt.trim()) { $('#reflectStatus').textContent = 'Saved (empty)'; return; }
  const r = await apiPost('reflect', { token: Auth.getToken(), session_id: LIVE.session_id, text: txt, visibility: 'circle' });
  $('#reflectStatus').textContent = r && r.ok ? 'Reflection saved.' : 'Could not save reflection.';
}

// start another round with same circle/target
async function startAnother() {
  const resp = await apiPost('start_session', { token: Auth.getToken(), circle_id: LIVE.circle_id, target_count: LIVE.target });
  if (resp && resp.ok) startLive(resp.session_id);
}

// done → back to My Circles
function doneComplete() {
  CUR_SESSION = null;
  show('myCircles');
  refreshCircles();
}

