import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, clearAccessToken, onUnauthorized, setAccessToken, tryRefreshToken } from '../lib/api';
import type { Account } from '../types';

interface AuthContextValue {
  user: Account | null;
  booting: boolean;
  signIn: (username: string, password: string) => Promise<Account>;
  signUp: (username: string, email: string, password: string) => Promise<Account>;
  social: (payload: {
    provider: string;
    token?: string;
    code?: string;
    redirect_uri?: string;
  }) => Promise<Account>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const refreshed = await tryRefreshToken();
      if (cancelled) return;
      if (!refreshed) {
        setBooting(false);
        return;
      }
      try {
        const account = await api.account.get();
        if (!cancelled) setUser(account);
      } catch {
        clearAccessToken();
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () =>
      onUnauthorized(() => {
        clearAccessToken();
        setUser(null);
      }),
    [],
  );

  const establish = useCallback(async (token: string): Promise<Account> => {
    setAccessToken(token);
    const account = await api.account.get();
    setUser(account);
    return account;
  }, []);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const res = await api.auth.signIn(username, password);
      return establish(res.tokens.access);
    },
    [establish],
  );

  const signUp = useCallback(
    async (username: string, email: string, password: string) => {
      const res = await api.auth.signUp(username, email, password);
      return establish(res.tokens.access);
    },
    [establish],
  );

  const social = useCallback(
    async (payload: { provider: string; token?: string; code?: string; redirect_uri?: string }) => {
      const res = await api.auth.social(payload);
      return establish(res.tokens.access);
    },
    [establish],
  );

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // the cookie is cleared server-side even on a failed blacklist
    }
    clearAccessToken();
    setUser(null);
  }, []);

  const reload = useCallback(async () => {
    const account = await api.account.get();
    setUser(account);
  }, []);

  const value = useMemo(
    () => ({ user, booting, signIn, signUp, social, signOut, reload }),
    [user, booting, signIn, signUp, social, signOut, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
