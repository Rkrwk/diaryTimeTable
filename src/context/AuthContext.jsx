import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// Supabase auth is email-based, so we synthesize a hidden email from the
// username. The user never sees or types this — they just use their username.
const EMAIL_DOMAIN = 'schedule.local';

export function emailForUsername(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signUp(username, password) {
    const uname = username.trim().toLowerCase();
    const { error } = await supabase.auth.signUp({
      email: emailForUsername(uname),
      password,
      options: { data: { username: uname, display_name: uname } },
    });
    if (error) throw error;
  }

  async function signIn(username, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email: emailForUsername(username),
      password,
    });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
