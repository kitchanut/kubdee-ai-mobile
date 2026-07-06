import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';

import {
  createSyncedProfile as pushSyncedProfile,
  fetchSyncedProfiles,
  fetchUserProfile,
  logoutSession,
  parseAuthCallbackUrl,
  refreshAuthToken,
  restoreSyncedProfile as pushRestoreSyncedProfile,
  sendHeartbeat,
  softDeleteSyncedProfile as pushSoftDeleteSyncedProfile,
} from '@/auth/api';
import { HEARTBEAT_INTERVAL_MS, LOGIN_URL, PLAN_RECHECK_INTERVAL_MS } from '@/auth/constants';
import { getRequiredPlanError } from '@/auth/plan';
import { OFFLINE_ERROR_MESSAGE } from '@/lib/apiError';
import {
  clearDeletedProfileConfirmation,
  clearStoredAuthTokens,
  confirmDeletedProfile as saveDeletedProfileConfirmation,
  getDeletedProfileConfirmations,
  getOrCreateSyncDeviceId,
  getStoredAuthTokens,
  saveStoredAuthTokens,
} from '@/auth/storage';
import type {
  AuthUser,
  CreateSyncedProfileInput,
  StoredAuthTokens,
  SyncedProfile,
  SyncedProfileGroup,
} from '@/auth/types';

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
  lastSyncedAt: number | null;
  profileSyncError: string | null;
  syncedProfileGroups: SyncedProfileGroup[];
  syncedProfiles: SyncedProfile[];
  deletedSyncedProfiles: SyncedProfile[];
  isSyncingProfiles: boolean;
  isCreatingProfile: boolean;
  isUpdatingProfile: boolean;
  profileDataError: string | null;
  createProfileError: string | null;
  lastProfilesSyncedAt: number | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  recheckPlan: () => Promise<void>;
  syncProfile: () => Promise<void>;
  syncProfileData: () => Promise<void>;
  createSyncedProfile: (input: CreateSyncedProfileInput) => Promise<boolean>;
  deleteSyncedProfile: (profile: SyncedProfile) => Promise<boolean>;
  restoreDeletedSyncedProfile: (profile: SyncedProfile) => Promise<boolean>;
  confirmDeletedProfileLocally: (profile: SyncedProfile) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getSessionExpiredMessage(error: string | null): string {
  if (error === 'Plan expired') {
    return 'Plan expired';
  }

  return error || 'Session expired';
}

function profileDeletionTimestamp(profile: SyncedProfile): number {
  const deletedAt = Number(profile.deletedAt ?? 0);
  return Number.isFinite(deletedAt) && deletedAt > 0 ? Math.floor(deletedAt) : 0;
}

function isDeletedProfileConfirmed(profile: SyncedProfile, confirmations: Record<string, number>): boolean {
  const confirmedAt = confirmations[profile.id] ?? 0;
  const deletedAt = profileDeletionTimestamp(profile);
  return confirmedAt > 0 && deletedAt > 0 && confirmedAt >= deletedAt;
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
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [profileSyncError, setProfileSyncError] = useState<string | null>(null);
  const [syncedProfileGroups, setSyncedProfileGroups] = useState<SyncedProfileGroup[]>([]);
  const [syncedProfiles, setSyncedProfiles] = useState<SyncedProfile[]>([]);
  const [deletedSyncedProfiles, setDeletedSyncedProfiles] = useState<SyncedProfile[]>([]);
  const [isSyncingProfiles, setIsSyncingProfiles] = useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileDataError, setProfileDataError] = useState<string | null>(null);
  const [createProfileError, setCreateProfileError] = useState<string | null>(null);
  const [lastProfilesSyncedAt, setLastProfilesSyncedAt] = useState<number | null>(null);

  const resetAuthState = useCallback((): void => {
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    setVerificationError(null);
    setLastSyncedAt(null);
    setProfileSyncError(null);
    setSyncedProfileGroups([]);
    setSyncedProfiles([]);
    setDeletedSyncedProfiles([]);
    setIsCreatingProfile(false);
    setIsUpdatingProfile(false);
    setProfileDataError(null);
    setCreateProfileError(null);
    setLastProfilesSyncedAt(null);
  }, []);

  const applyVerifiedSession = useCallback(
    async (tokens: StoredAuthTokens, verifiedUser: AuthUser): Promise<void> => {
      await saveStoredAuthTokens(tokens);
      setToken(tokens.accessToken);
      setRefreshToken(tokens.refreshToken);
      setUser(verifiedUser);
      setAuthError(null);
      setVerificationError(null);
      setProfileSyncError(null);
      setLastSyncedAt(Date.now());
    },
    []
  );

  const verifyTokens = useCallback(
    async (tokens: StoredAuthTokens): Promise<StoredAuthTokens | null> => {
      const profile = await fetchUserProfile(tokens.accessToken);
      if (profile.ok && profile.data) {
        await applyVerifiedSession(tokens, profile.data);
        return tokens;
      }

      if (profile.status === 401 && tokens.refreshToken) {
        const refreshed = await refreshAuthToken(tokens.refreshToken);
        if (refreshed.ok && refreshed.data?.accessToken && refreshed.data.user) {
          const nextTokens = {
            accessToken: refreshed.data.accessToken,
            refreshToken: tokens.refreshToken,
          };

          await applyVerifiedSession(
            nextTokens,
            refreshed.data.user
          );
          return nextTokens;
        }

        const errorMessage = getSessionExpiredMessage(refreshed.error);
        setAuthError(errorMessage);
        setProfileSyncError(errorMessage);
      } else {
        const errorMessage = getSessionExpiredMessage(profile.error);
        setAuthError(errorMessage);
        setProfileSyncError(errorMessage);
      }

      if (profile.status === 401) {
        await clearStoredAuthTokens();
        resetAuthState();
      }

      return null;
    },
    [applyVerifiedSession, resetAuthState]
  );

  const loadSyncedProfileData = useCallback(async (accessToken: string): Promise<boolean> => {
    setIsSyncingProfiles(true);

    try {
      const result = await fetchSyncedProfiles(accessToken);
      if (result.ok && result.data) {
        const confirmations = await getDeletedProfileConfirmations();
        setSyncedProfileGroups(result.data.groups);
        setSyncedProfiles(result.data.profiles);
        setDeletedSyncedProfiles(
          result.data.deletedProfiles.filter((profile) => !isDeletedProfileConfirmed(profile, confirmations))
        );
        setProfileDataError(null);
        setLastProfilesSyncedAt(Date.now());
        return true;
      }

      const errorMessage = result.error || 'โหลดข้อมูลโปรไฟล์ไม่สำเร็จ';
      setProfileDataError(errorMessage);
      return false;
    } finally {
      setIsSyncingProfiles(false);
    }
  }, []);

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
      setProfileSyncError(null);
      return;
    }

    setIsCheckingPlan(true);
    try {
      const verified = await verifyTokens({ accessToken: token, refreshToken });
      if (!verified) {
        setVerificationError(OFFLINE_ERROR_MESSAGE);
      }
    } finally {
      setIsCheckingPlan(false);
    }
  }, [refreshToken, token, verifyTokens]);

  const syncProfileData = useCallback(async (): Promise<void> => {
    if (!token) {
      setSyncedProfileGroups([]);
      setSyncedProfiles([]);
      setDeletedSyncedProfiles([]);
      setProfileDataError(null);
      setLastProfilesSyncedAt(null);
      return;
    }

    await loadSyncedProfileData(token);
  }, [loadSyncedProfileData, token]);

  const syncProfile = useCallback(async (): Promise<void> => {
    if (!token) {
      setVerificationError(null);
      setProfileSyncError(null);
      setProfileDataError(null);
      return;
    }

    setIsCheckingPlan(true);
    try {
      const verifiedTokens = await verifyTokens({ accessToken: token, refreshToken });
      if (!verifiedTokens) {
        setVerificationError(OFFLINE_ERROR_MESSAGE);
        return;
      }

      await loadSyncedProfileData(verifiedTokens.accessToken);
    } finally {
      setIsCheckingPlan(false);
    }
  }, [loadSyncedProfileData, refreshToken, token, verifyTokens]);

  const createSyncedProfile = useCallback(
    async (input: CreateSyncedProfileInput): Promise<boolean> => {
      const name = input.name.trim();
      if (!name) {
        setCreateProfileError('กรุณากรอกชื่อโปรไฟล์');
        return false;
      }

      if (!token) {
        setCreateProfileError('กรุณาเข้าสู่ระบบก่อนสร้างโปรไฟล์');
        return false;
      }

      setIsCreatingProfile(true);
      setCreateProfileError(null);
      try {
        const verifiedTokens = await verifyTokens({ accessToken: token, refreshToken });
        if (!verifiedTokens) {
          setCreateProfileError(OFFLINE_ERROR_MESSAGE);
          return false;
        }

        const deviceId = await getOrCreateSyncDeviceId();
        const result = await pushSyncedProfile(verifiedTokens.accessToken, {
          ...input,
          name,
          deviceId,
        });

        if (!result.ok) {
          setCreateProfileError(result.error || 'สร้างโปรไฟล์ไม่สำเร็จ');
          return false;
        }

        return await loadSyncedProfileData(verifiedTokens.accessToken);
      } finally {
        setIsCreatingProfile(false);
      }
    },
    [loadSyncedProfileData, refreshToken, token, verifyTokens]
  );

  const deleteSyncedProfile = useCallback(
    async (profile: SyncedProfile): Promise<boolean> => {
      if (!token) {
        setProfileDataError('กรุณาเข้าสู่ระบบก่อนลบโปรไฟล์');
        return false;
      }

      setIsUpdatingProfile(true);
      setProfileDataError(null);
      try {
        const verifiedTokens = await verifyTokens({ accessToken: token, refreshToken });
        if (!verifiedTokens) {
          setProfileDataError(OFFLINE_ERROR_MESSAGE);
          return false;
        }

        const deviceId = await getOrCreateSyncDeviceId();
        await clearDeletedProfileConfirmation(profile.id);
        const result = await pushSoftDeleteSyncedProfile(verifiedTokens.accessToken, { profile, deviceId });
        if (!result.ok) {
          setProfileDataError(result.error || 'ลบโปรไฟล์ไม่สำเร็จ');
          return false;
        }

        return await loadSyncedProfileData(verifiedTokens.accessToken);
      } finally {
        setIsUpdatingProfile(false);
      }
    },
    [loadSyncedProfileData, refreshToken, token, verifyTokens]
  );

  const restoreDeletedSyncedProfile = useCallback(
    async (profile: SyncedProfile): Promise<boolean> => {
      if (!token) {
        setProfileDataError('กรุณาเข้าสู่ระบบก่อนกู้คืนโปรไฟล์');
        return false;
      }

      setIsUpdatingProfile(true);
      setProfileDataError(null);
      try {
        const verifiedTokens = await verifyTokens({ accessToken: token, refreshToken });
        if (!verifiedTokens) {
          setProfileDataError(OFFLINE_ERROR_MESSAGE);
          return false;
        }

        const deviceId = await getOrCreateSyncDeviceId();
        await clearDeletedProfileConfirmation(profile.id);
        const result = await pushRestoreSyncedProfile(verifiedTokens.accessToken, { profile, deviceId });
        if (!result.ok) {
          setProfileDataError(result.error || 'กู้คืนโปรไฟล์ไม่สำเร็จ');
          return false;
        }

        return await loadSyncedProfileData(verifiedTokens.accessToken);
      } finally {
        setIsUpdatingProfile(false);
      }
    },
    [loadSyncedProfileData, refreshToken, token, verifyTokens]
  );

  const confirmDeletedProfileLocally = useCallback(async (profile: SyncedProfile): Promise<void> => {
    const deletedAt = profileDeletionTimestamp(profile);
    if (deletedAt <= 0) {
      return;
    }

    await saveDeletedProfileConfirmation(profile.id, deletedAt);
    setDeletedSyncedProfiles((current) => current.filter((item) => item.id !== profile.id));
  }, []);

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
      lastSyncedAt,
      profileSyncError,
      syncedProfileGroups,
      syncedProfiles,
      deletedSyncedProfiles,
      isSyncingProfiles,
      isCreatingProfile,
      isUpdatingProfile,
      profileDataError,
      createProfileError,
      lastProfilesSyncedAt,
      login,
      logout,
      recheckPlan,
      syncProfile,
      syncProfileData,
      createSyncedProfile,
      deleteSyncedProfile,
      restoreDeletedSyncedProfile,
      confirmDeletedProfileLocally,
    }),
    [
      authError,
      confirmDeletedProfileLocally,
      createProfileError,
      createSyncedProfile,
      deleteSyncedProfile,
      deletedSyncedProfiles,
      isCheckingPlan,
      isCreatingProfile,
      isLoading,
      isLoggingIn,
      isPlanValid,
      isSyncingProfiles,
      isUpdatingProfile,
      login,
      logout,
      lastProfilesSyncedAt,
      lastSyncedAt,
      planError,
      profileDataError,
      profileSyncError,
      recheckPlan,
      refreshToken,
      restoreDeletedSyncedProfile,
      syncProfile,
      syncProfileData,
      syncedProfileGroups,
      syncedProfiles,
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
