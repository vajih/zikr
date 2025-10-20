// Minimal API client for Apps Script backend
const API_BASE = 'https://script.google.com/macros/s/AKfycbwssDxHc9dO_y3mjIQ5wtPY3rta3elC6fhT2JbrdtIOvKx7NNdRFChK4G6QRQefouEV/exec';


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
headers:{ 'Content-Type': 'text/plain;charset=utf-8' },
body: JSON.stringify({ action, ...payload })
});
return res.json();
}