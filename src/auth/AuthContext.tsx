import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';

import {
  fetchUserProfile,
  logoutSession,
  parseAuthCallbackUrl,
  refreshAuthToken,
  sendHeartbeat,
} from '@/auth/api';
import { HEARTBEAT_INTERVAL_MS, LOGIN_URL, PLAN_RECHECK_INTERVAL_MS } from '@/auth/constants';
import { getRequiredPlanError } from '@/auth/plan';
import { clearStoredAuthTokens, getStoredAuthTokens, saveStoredAuthTokens } from '@/auth/storage';
import type { AuthUser, StoredAuthTokens } from '@/auth/types';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isLoggingIn: boolean;
  isCheckingPlan: boolean;
  isPlanValid: boolean;
  planError: string | null;
  authError: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  recheckPlan: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getSessionExpiredMessage(error: string | null): string {
  if (error === 'Plan expired') {
    return 'Plan expired';
  }

  return error || 'Session expired';
}

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isCheckingPlan, setIsCheckingPlan] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const resetAuthState = useCallback((): void => {
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    setVerificationError(null);
  }, []);

  const applyVerifiedSession = useCallback(
    async (tokens: StoredAuthTokens, verifiedUser: AuthUser): Promise<void> => {
      await saveStoredAuthTokens(tokens);
      setToken(tokens.accessToken);
      setRefreshToken(tokens.refreshToken);
      setUser(verifiedUser);
      setAuthError(null);
      setVerificationError(null);
    },
    []
  );

  const verifyTokens = useCallback(
    async (tokens: StoredAuthTokens): Promise<boolean> => {
      const profile = await fetchUserProfile(tokens.accessToken);
      if (profile.ok && profile.data) {
        await applyVerifiedSession(tokens, profile.data);
        return true;
      }

      if (profile.status === 401 && tokens.refreshToken) {
        const refreshed = await refreshAuthToken(tokens.refreshToken);
        if (refreshed.ok && refreshed.data?.accessToken && refreshed.data.user) {
          await applyVerifiedSession(
            {
              accessToken: refreshed.data.accessToken,
              refreshToken: tokens.refreshToken,
            },
            refreshed.data.user
          );
          return true;
        }

        setAuthError(getSessionExpiredMessage(refreshed.error));
      } else {
        setAuthError(getSessionExpiredMessage(profile.error));
      }

      if (profile.status === 401) {
        await clearStoredAuthTokens();
        resetAuthState();
      }

      return false;
    },
    [applyVerifiedSession, resetAuthState]
  );

  useEffect(() => {
    const restoreAuth = async (): Promise<void> => {
      try {
        const storedTokens = await getStoredAuthTokens();
        if (storedTokens) {
          await verifyTokens(storedTokens);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void restoreAuth();
  }, [verifyTokens]);

  useEffect(() => {
    const handleUrl = (url: string | null): void => {
      if (!url) {
        return;
      }

      const callbackTokens = parseAuthCallbackUrl(url);
      if (!callbackTokens) {
        return;
      }

      setIsLoading(true);
      void verifyTokens(callbackTokens).finally(() => {
        setIsLoading(false);
      });
    };

    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    void Linking.getInitialURL().then(handleUrl);

    return () => {
      subscription.remove();
    };
  }, [verifyTokens]);

  const login = useCallback(async (): Promise<void> => {
    setAuthError(null);
    setIsLoggingIn(true);

    try {
      await Linking.openURL(LOGIN_URL);
    } catch {
      setAuthError('Cannot open login browser');
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    const currentToken = token;
    if (currentToken) {
      await logoutSession(currentToken);
    }

    await clearStoredAuthTokens();
    resetAuthState();
    setAuthError(null);
  }, [resetAuthState, token]);

  const recheckPlan = useCallback(async (): Promise<void> => {
    if (!token) {
      setVerificationError(null);
      return;
    }

    setIsCheckingPlan(true);
    try {
      const verified = await verifyTokens({ accessToken: token, refreshToken });
      if (!verified) {
        setVerificationError('Online verification required. Please check your internet connection.');
      }
    } finally {
      setIsCheckingPlan(false);
    }
  }, [refreshToken, token, verifyTokens]);

  useEffect(() => {
    if (!token || !user) {
      return undefined;
    }

    const interval = setInterval(() => {
      void recheckPlan();
    }, PLAN_RECHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [recheckPlan, token, user]);

  const derivedPlanError = useMemo(() => {
    if (!user) {
      return null;
    }

    return getRequiredPlanError(user);
  }, [user]);

  const planError = verificationError || derivedPlanError;
  const isPlanValid = Boolean(user && token && !planError);

  useEffect(() => {
    if (!token || !isPlanValid) {
      return undefined;
    }

    void sendHeartbeat(token);
    const interval = setInterval(() => {
      void sendHeartbeat(token);
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isPlanValid, token]);

  const value = useMemo(
    () => ({
      user,
      token,
      refreshToken,
      isLoading,
      isLoggingIn,
      isCheckingPlan,
      isPlanValid,
      planError,
      authError,
      login,
      logout,
      recheckPlan,
    }),
    [
      authError,
      isCheckingPlan,
      isLoading,
      isLoggingIn,
      isPlanValid,
      login,
      logout,
      planError,
      recheckPlan,
      refreshToken,
      token,
      user,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
