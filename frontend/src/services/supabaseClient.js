import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://demo-project.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'demo-anon-key-placeholder';

let client = null;

if (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('demo-project')) {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    console.warn('[Supabase Frontend] Client initialization deferred:', err.message);
  }
}

export const supabase = client;

export async function getSupabaseSession() {
  if (!supabase) return null;
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  } catch (err) {
    console.warn('[Supabase Frontend] getSession error:', err.message);
    return null;
  }
}

export function subscribeToRealtimeIncidents(onIncidentChange) {
  if (!supabase) return () => {};

  const channel = supabase
    .channel('public:incidents')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, (payload) => {
      onIncidentChange && onIncidentChange(payload);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export default supabase;
