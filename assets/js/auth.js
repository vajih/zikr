// Super‑light auth for MVP: store token in localStorage
const Auth = {
setToken(t){ localStorage.setItem('zikr_token', t); },
getToken(){ return localStorage.getItem('zikr_token'); },
isAuthed(){ return !!Auth.getToken(); }
};