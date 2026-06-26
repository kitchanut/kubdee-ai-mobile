import { StatusBar } from 'expo-status-bar';
import { colorScheme as nativeWindColorScheme } from 'nativewind';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  pushAutomationActivityLog,
  useAutomationActivityNativeBridge,
} from '@/activity/automationActivityLogStore';
import GoogleFlowWebViewRunnerHost from '@/autopilot/GoogleFlowWebViewRunnerHost';
import { useAuth } from '@/auth/AuthContext';
import MobileHeader from '@/components/MobileHeader';
import TopIconTabs from '@/components/TopIconTabs';
import { useShopeeIncrementalProductSaver } from '@/hooks/useShopeeIncrementalProductSaver';
import { useLibrary } from '@/library/LibraryContext';
import { consumePendingTab, tabFromUrl } from '@/navigation/pendingNavigation';
import type { AutoPilotProductSelectionRequest } from '@/autopilot/selectionRequest';
import PlaceholderScreen from '@/screens/PlaceholderScreen';
import AutoPilotScreen from '@/screens/AutoPilotScreen';
import AuthLoadingScreen from '@/screens/AuthLoadingScreen';
import ImageCreateScreen from '@/screens/ImageWorkspaceLibraryStyleScreen';
import LibraryScreen from '@/screens/LibraryScreen';
import LoginScreen from '@/screens/LoginScreen';
import LogsScreen from '@/screens/LogsScreen';
import MobileDevicesScreen from '@/screens/MobileDevicesScreen';
import PlanRequiredScreen from '@/screens/PlanRequiredScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import ShopeeScreen from '@/screens/ShopeeScreen';
import { darkTheme, lightTheme } from '@/theme/tokens';
import type { TabId } from '@/types/navigation';

type ThemeMode = 'dark' | 'light';

const SELECTED_PROFILE_STORAGE_KEY = 'kubdee_ai_mobile_selected_profile_id';

function uniqueProductIds(productIds: string[]): string[] {
  return Array.from(new Set(productIds.map((productId) => productId.trim()).filter(Boolean)));
}

function areSameProductIds(first: string[], second: string[]): boolean {
  if (first.length !== second.length) {
    return false;
  }

  return first.every((productId, index) => productId === second[index]);
}

export default function KubdeeMobileApp(): React.JSX.Element {
  const colorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    colorScheme === 'light' ? 'light' : 'dark'
  );
  const theme = useMemo(() => (themeMode === 'light' ? lightTheme : darkTheme), [themeMode]);
  useAutomationActivityNativeBridge();

  // Keep NativeWind's dark: variants and CSS vars in sync with the
  // in-app theme toggle (single source of truth stays in themeMode).
  useEffect(() => {
    nativeWindColorScheme.set(themeMode);
  }, [themeMode]);

  const [activeTab, setActiveTab] = useState<TabId>('pipeline');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [autoPilotSelectedProductIdsByProfile, setAutoPilotSelectedProductIdsByProfile] =
    useState<Record<string, string[]>>({});
  const [autoPilotSelectionRequest, setAutoPilotSelectionRequest] =
    useState<AutoPilotProductSelectionRequest | null>(null);
  const [hasLoadedSelectedProfile, setHasLoadedSelectedProfile] = useState(false);
  const auth = useAuth();
  const { importShopeeProducts } = useLibrary();

  const appendRecoveredShopeeLog = useCallback((message: string, ts = Date.now()): void => {
    pushAutomationActivityLog('shopee-import', message, ts);
  }, []);

  useShopeeIncrementalProductSaver({
    selectedProfileId,
    importShopeeProducts,
    appendLog: appendRecoveredShopeeLog,
  });

  const toggleThemeMode = (): void => {
    setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const hasAttemptedProfileSync = auth.lastProfilesSyncedAt !== null || auth.profileDataError !== null;

  useEffect(() => {
    let active = true;

    Linking.getInitialURL()
      .then((url) => {
        if (!active) return;
        const tab = tabFromUrl(url);
        if (tab) {
          setActiveTab(tab);
        }
      })
      .catch(() => {
        // Pending tab fallback below covers Shopee import recovery.
      });

    consumePendingTab()
      .then((tab) => {
        if (active && tab) {
          setActiveTab(tab);
        }
      })
      .catch(() => {
        // Non-critical navigation hint.
      });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const tab = tabFromUrl(url);
      if (tab) {
        setActiveTab(tab);
      }
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(SELECTED_PROFILE_STORAGE_KEY)
      .then((profileId) => {
        if (active && profileId?.trim()) {
          setSelectedProfileId(profileId.trim());
        }
      })
      .catch(() => {
        // Falling back to the first synced profile is handled by the validation effect below.
      })
      .finally(() => {
        if (active) {
          setHasLoadedSelectedProfile(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedSelectedProfile) {
      return;
    }

    if (selectedProfileId) {
      void AsyncStorage.setItem(SELECTED_PROFILE_STORAGE_KEY, selectedProfileId);
      return;
    }

    void AsyncStorage.removeItem(SELECTED_PROFILE_STORAGE_KEY);
  }, [hasLoadedSelectedProfile, selectedProfileId]);

  useEffect(() => {
    if (
      !auth.token ||
      !auth.isPlanValid ||
      auth.syncedProfiles.length > 0 ||
      auth.isSyncingProfiles ||
      hasAttemptedProfileSync
    ) {
      return;
    }

    void auth.syncProfileData();
  }, [
    auth.isPlanValid,
    auth.isSyncingProfiles,
    auth.lastProfilesSyncedAt,
    auth.profileDataError,
    auth.syncProfileData,
    auth.syncedProfiles.length,
    auth.token,
    hasAttemptedProfileSync,
  ]);

  useEffect(() => {
    if (!hasLoadedSelectedProfile) {
      return;
    }

    if (auth.syncedProfiles.length === 0 && (auth.isSyncingProfiles || !hasAttemptedProfileSync)) {
      return;
    }

    const hasSelectedProfile = auth.syncedProfiles.some((profile) => profile.id === selectedProfileId);
    const nextProfileId = hasSelectedProfile ? selectedProfileId : auth.syncedProfiles[0]?.id ?? '';

    if (nextProfileId !== selectedProfileId) {
      setSelectedProfileId(nextProfileId);
    }
  }, [
    auth.isSyncingProfiles,
    auth.syncedProfiles,
    hasAttemptedProfileSync,
    hasLoadedSelectedProfile,
    selectedProfileId,
  ]);

  const sendProductsToAutoPilot = useCallback((productIds: string[], profileLocalId: string): void => {
    const cleanProductIds = uniqueProductIds(productIds);
    if (cleanProductIds.length === 0) {
      return;
    }

    setSelectedProfileId(profileLocalId);
    setAutoPilotSelectedProductIdsByProfile((current) => ({
      ...current,
      [profileLocalId]: cleanProductIds,
    }));
    setAutoPilotSelectionRequest({
      productIds: cleanProductIds,
      profileLocalId,
      requestId: Date.now(),
    });
    setActiveTab('pipeline');
  }, []);

  const handleAutoPilotSelectedProductIdsChange = useCallback((productIds: string[], profileLocalId: string): void => {
    const cleanProfileLocalId = profileLocalId.trim();
    if (!cleanProfileLocalId) {
      return;
    }

    const cleanProductIds = uniqueProductIds(productIds);
    setAutoPilotSelectedProductIdsByProfile((current) => {
      const currentProductIds = current[cleanProfileLocalId] ?? [];
      if (areSameProductIds(currentProductIds, cleanProductIds)) {
        return current;
      }

      if (cleanProductIds.length === 0) {
        const next = { ...current };
        delete next[cleanProfileLocalId];
        return next;
      }

      return {
        ...current,
        [cleanProfileLocalId]: cleanProductIds,
      };
    });
  }, []);

  const handleAutoPilotSelectionHandled = useCallback((requestId: number): void => {
    setAutoPilotSelectionRequest((current) =>
      current?.requestId === requestId ? null : current
    );
  }, []);

  const renderScreen = (): React.JSX.Element => {
    switch (activeTab) {
      case 'pipeline':
        return (
          <AutoPilotScreen
            key={selectedProfileId || 'no-profile'}
            initialSelectedProductIds={
              selectedProfileId ? autoPilotSelectedProductIdsByProfile[selectedProfileId] ?? [] : []
            }
            onSelectedProductIdsChange={handleAutoPilotSelectedProductIdsChange}
            selectedProfileId={selectedProfileId}
            selectionRequest={autoPilotSelectionRequest}
            theme={theme}
            onSelectionRequestHandled={handleAutoPilotSelectionHandled}
          />
        );
      case 'image-create':
        return <ImageCreateScreen selectedProfileId={selectedProfileId} theme={theme} />;
      case 'mobile':
        return <MobileDevicesScreen theme={theme} />;
      case 'shopee':
        return (
          <ShopeeScreen
            selectedProfileId={selectedProfileId}
            theme={theme}
            selectedCount={1}
            onImportFinished={() => setActiveTab('library')}
          />
        );
      case 'logs':
        return <LogsScreen theme={theme} />;
      case 'profile':
        return (
          <ProfileScreen
            selectedProfileId={selectedProfileId}
            theme={theme}
            onSelectProfile={setSelectedProfileId}
          />
        );
      case 'tiktok':
        return <PlaceholderScreen theme={theme} title="TikTok" accent="cyan" />;
      case 'youtube':
        return <PlaceholderScreen theme={theme} title="YouTube" accent="red" />;
      case 'facebook':
        return <PlaceholderScreen theme={theme} title="Facebook" accent="blue" />;
      case 'library':
        return (
          <LibraryScreen
            selectedProfileId={selectedProfileId}
            theme={theme}
            onSendProductsToAutoPilot={sendProductsToAutoPilot}
          />
        );
      default:
        return <MobileDevicesScreen theme={theme} />;
    }
  };

  return (
    <View className="flex-1 bg-kd-screen">
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <SafeAreaView edges={['top', 'bottom']} className="flex-1">
        <View className="flex-1 bg-kd-panel">
          {auth.isLoading ? (
            <AuthLoadingScreen theme={theme} />
          ) : !auth.user || !auth.token ? (
            <LoginScreen
              authError={auth.authError}
              isLoggingIn={auth.isLoggingIn}
              theme={theme}
              onLogin={auth.login}
              onThemeModeToggle={toggleThemeMode}
            />
          ) : !auth.isPlanValid ? (
            <PlanRequiredScreen
              isCheckingPlan={auth.isCheckingPlan}
              planError={auth.planError}
              theme={theme}
              onLogout={auth.logout}
              onRecheck={auth.recheckPlan}
            />
          ) : (
            <>
              <MobileHeader
                isSyncingProfiles={auth.isSyncingProfiles}
                profileDataError={auth.profileDataError}
                profileGroups={auth.syncedProfileGroups}
                profiles={auth.syncedProfiles}
                runningCount={0}
                selectedProfileId={selectedProfileId}
                theme={theme}
                onLogsPress={() => setActiveTab('logs')}
                onProfilePress={() => setActiveTab('profile')}
                onSelectedProfileChange={setSelectedProfileId}
                onThemeModeToggle={toggleThemeMode}
              />
              <TopIconTabs activeTab={activeTab} theme={theme} onTabChange={setActiveTab} />
              <View className="min-h-0 flex-1">{renderScreen()}</View>
              <GoogleFlowWebViewRunnerHost theme={theme} />
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
