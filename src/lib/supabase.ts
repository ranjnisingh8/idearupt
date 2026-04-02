import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://hseuprmcguiqgrdcqexi.supabase.co";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzZXVwcm1jZ3VpcWdyZGNxZXhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1Mzg2MzAsImV4cCI6MjA4NjExNDYzMH0.QAVQVKV5bMLcIibYREVrqWuT7v36d1HP8sIYVDRqRSY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    // Override the Navigator LockManager to prevent "Acquiring an exclusive
    // Navigator LockManager lock timed out waiting 10000ms" errors.
    // The default uses navigator.locks which times out on some mobile browsers
    // and PWA contexts. This no-op lock just runs the fn immediately.
    lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
      return await fn();
    },
  }
});
