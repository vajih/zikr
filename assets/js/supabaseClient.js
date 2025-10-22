// assets/js/supabaseClient.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

if (!window.__env?.SUPABASE_URL || !window.__env?.SUPABASE_ANON_KEY) {
  console.error('Supabase env not found. Make sure assets/js/config.js loads BEFORE this file.');
}

export const supabase = createClient(
  window.__env.SUPABASE_URL,
  window.__env.SUPABASE_ANON_KEY
);
