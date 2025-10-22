// assets/js/auth.js
import { supabase } from './supabaseClient.js';

// ---- Elements ----
const form = document.getElementById('signin-form');
const nameInput = document.getElementById('signin-name');
const emailInput = document.getElementById('signin-email');

// Two different sign-out buttons in your HTML:
//  - inside the auth section:  id="btn-signout"
//  - in the header/nav:        id="btnSignOut"
const signoutBtnAuth = document.getElementById('btn-signout');
const signoutBtnHeader = document.getElementById('btnSignOut');

const authStatusEl = document.getElementById('authStatus');

// ---- Helpers ----
function setStatus(msg) {
  if (authStatusEl) authStatusEl.textContent = msg || '';
}

function dispatchAuthed(session) {
  document.dispatchEvent(new CustomEvent('supabase:authed', { detail: session }));
}

// ---- Boot: if already signed in, tell the app ----
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    dispatchAuthed(session);
  }
});

// ---- Sign-in (magic link / OTP) ----
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput?.value?.trim();
    const displayName = nameInput?.value?.trim();

    if (!email) {
      setStatus('Please enter your email.');
      return;
    }

    // Save desired display name to set after the user returns
    try {
      localStorage.setItem('pendingDisplayName', displayName || '');
    } catch (_) {}

    setStatus('Sending magic link…');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // When testing locally, you’ll return to the same page.
        emailRedirectTo: `${location.origin}${location.pathname}`,
      },
    });

    if (error) {
      console.error('Magic link error:', error);
      setStatus('Could not send magic link. See console.');
      return;
    }

    setStatus('Magic link sent. On local dev, open Mailpit: http://127.0.0.1:54324');
    alert('Magic link sent. On local dev, open Mailpit: http://127.0.0.1:54324');
  });
}

// ---- When auth state changes (user clicked the email link) ----
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (!session?.user) return;

  // Set display_name once if we saved one
  try {
    const pending = localStorage.getItem('pendingDisplayName');
    if (pending) {
      localStorage.removeItem('pendingDisplayName');
      if (pending.trim()) {
        const { error: updErr } = await supabase.auth.updateUser({
          data: { display_name: pending.trim() },
        });
        if (updErr) console.warn('Failed to set display_name:', updErr.message);
      }
    }
  } catch (_) {}

  // Notify the rest of the app (api.js etc.)
  dispatchAuthed(session);
});

// ---- Sign-out (both buttons) ----
async function handleSignOut() {
  try {
    await supabase.auth.signOut();
  } finally {
    // Simple, reliable reset
    location.reload();
  }
}

if (signoutBtnAuth)   signoutBtnAuth.addEventListener('click', handleSignOut);
if (signoutBtnHeader) signoutBtnHeader.addEventListener('click', handleSignOut);
