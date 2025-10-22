// assets/js/dev-test.js
import { supabase } from './supabaseClient.js';

async function devLogin() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'test@zikr.local',
    password: 'Test1234!',
  });
  if (error) console.error('Login error:', error);
  else console.log('Logged in as:', data.user?.email);
}

async function testSupabase() {
  const { data, error } = await supabase
    .from('circles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Supabase connection test →', { data, error });
}

document.addEventListener('DOMContentLoaded', async () => {
  await devLogin();      // TEMP for dev only
  await testSupabase();  // should return your Morning Zikr row(s)
});
