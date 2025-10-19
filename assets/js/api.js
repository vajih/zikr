// Minimal API client for Apps Script backend
const API_BASE = 'https://script.google.com/macros/s/AKfycbw2Oxf2FCxr6JaEhAkMFwRMpfUThjQlBbDSgQpM7px47C4l1T6Pp46C9AIBma0FaNBB/exec';


async function apiGet(action, params={}){
const url = new URL(API_BASE);
url.searchParams.set('action', action);
Object.entries(params).forEach(([k,v])=> url.searchParams.set(k, v));
const res = await fetch(url, { method:'GET' });
return res.json();
}


async function apiPost(action, payload={}){
const res = await fetch(API_BASE, {
method:'POST',
headers:{ 'Content-Type': 'application/json' },
body: JSON.stringify({ action, ...payload })
});
return res.json();
}