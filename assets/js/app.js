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
    const li = document.createElement('li');
    li.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <div>
          <strong>${c.name}</strong><br>
          <small>${(c.recitation_text || '').slice(0, 80)}</small><br>
          Target: ${c.target_count}
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; min-width:140px;">
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
        target_count: c.target_count
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
