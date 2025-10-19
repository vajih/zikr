// Minimal API client for Apps Script backend
const API_BASE = 'https://script.google.com/macros/s/AKfycbwf53XJsnK2D1EpxuU3qiWiEugLDUxCUGAJYnkWmGuFgnq6WiTeS2yHVgRwuLw_yQr7/exec';


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