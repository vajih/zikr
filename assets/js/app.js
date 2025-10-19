const $ = (s)=>document.querySelector(s);

// Simple section switcher used across the app. Exposed on window so
// other modules / inline handlers can call `show('create')` etc.
window.show = function(id){
	// hide all top-level sections inside <main>
	document.querySelectorAll('main > section').forEach(sec=> sec.hidden = true);
	const el = document.getElementById(id);
	if(el) el.hidden = false;
};
async function refreshCircles(){
const {ok, circles} = await apiGet('list_circles', { token: Auth.getToken() });
const ul = $('#listCircles'); ul.innerHTML='';
if(!ok || !circles || !circles.length){ ul.innerHTML='<li>No circles yet.</li>'; return; }
circles.forEach(c=>{
const li = document.createElement('li');
li.innerHTML = `<strong>${c.name}</strong><br><small>${c.recitation_text?.slice(0,80)||''}</small><br>Target: ${c.target_count}`;
li.addEventListener('click', async ()=>{
// Start a new session for quick demo
const resp = await apiPost('start_session', { token: Auth.getToken(), circle_id: c.id, target_count: c.target_count });
if(resp.ok){ startLive(resp.session_id); }
});
ul.appendChild(li);
});
}


let YOU=0, POLL_ID=null, CUR_SESSION=null;


async function startLive(session_id){
CUR_SESSION = session_id; YOU = 0; show('session');
const info = await apiGet('get_session', { token: Auth.getToken(), session_id });
if(info.ok){
$('#sessionTitle').textContent = info.circle.name;
$('#target').textContent = info.session.target_count;
$('#circleCount').textContent = info.session.completed_count;
$('#youCount').textContent = YOU;
}
if(POLL_ID) clearInterval(POLL_ID);
POLL_ID = setInterval(async ()=>{
const s = await apiGet('get_session', { token: Auth.getToken(), session_id: CUR_SESSION });
if(s.ok){ $('#circleCount').textContent = s.session.completed_count; }
}, 1500);
}


async function increment(){
YOU += 1; $('#youCount').textContent = YOU;
const r = await apiPost('increment', { token: Auth.getToken(), session_id: CUR_SESSION, delta: 1 });
if(r.ok){ $('#circleCount').textContent = r.completed_count; }
}


async function closeSession(){
if(!CUR_SESSION) return;
await apiPost('close_session', { token: Auth.getToken(), session_id: CUR_SESSION });
clearInterval(POLL_ID); CUR_SESSION=null; show('myCircles'); await refreshCircles();
}


// Wireup
window.addEventListener('DOMContentLoaded', async ()=>{
$('#btnShowCreate').onclick = ()=> show('create');
$('#btnShowJoin').onclick = ()=> alert('Invite codes coming soon (MVP keeps private circles).');
$('#btnShowMy').onclick = ()=>{ show('myCircles'); refreshCircles(); };
$('#btnSignOut').onclick = ()=>{localStorage.removeItem('zikr_token'); show('auth');};
if (Auth.isAuthed()) {
  apiGet('me', { token: Auth.getToken() }).then(r=>{
    if (r && r.ok && r.user && r.user.name) {
      document.querySelector('h1').textContent = `Zikr Circle — ${r.user.name}`;
    }
  });
  show('myCircles'); refreshCircles();
}


$('#formSignup').addEventListener('submit', async (e)=>{
	e.preventDefault();
	const f = new FormData(e.target);
	try{
		const r = await apiPost('signup', { email: f.get('email'), name: f.get('name') });
		if(r && r.ok){
			Auth.setToken(r.token);
			$('#authStatus').textContent = 'Signed in. Token saved.';
			// safe call to global show
			if(typeof window.show === 'function') window.show('create');
		} else {
			$('#authStatus').textContent = r && r.error ? `Error: ${r.error}` : 'Error signing in.';
		}
	}catch(err){
		console.error('Signup failed', err);
		$('#authStatus').textContent = 'Network or server error signing in. See console.';
	}
});


$('#formCreateCircle').addEventListener('submit', async (e)=>{
	e.preventDefault();
	const f = new FormData(e.target);
	const payload = Object.fromEntries(f.entries());
	try{
		const r = await apiPost('create_circle', { token: Auth.getToken(), ...payload });
		if(r && r.ok){
			$('#createStatus').textContent = 'Circle created.';
			if(typeof window.show === 'function') window.show('myCircles');
			refreshCircles();
		} else {
			$('#createStatus').textContent = r && r.error ? `Error: ${r.error}` : 'Error creating circle.';
		}
	}catch(err){
		console.error('Create circle failed', err);
		$('#createStatus').textContent = 'Network or server error creating circle. See console.';
	}
});


$('#btnTasbih').onclick = increment;
$('#btnClose').onclick = closeSession;


if(Auth.isAuthed()){ show('myCircles'); refreshCircles(); }
});