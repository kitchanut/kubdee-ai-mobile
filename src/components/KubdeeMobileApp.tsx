import { StatusBar } from 'expo-status-bar';
import { colorScheme as nativeWindColorScheme } from 'nativewind';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAutomationActivityNativeBridge } from '@/activity/automationActivityLogStore';
import { useAuth } from '@/auth/AuthContext';
import MobileHeader from '@/components/MobileHeader';
import TopIconTabs from '@/components/TopIconTabs';
import PlaceholderScreen from '@/screens/PlaceholderScreen';
import AutoPilotScreen from '@/screens/AutoPilotScreen';
import AuthLoadingScreen from '@/screens/AuthLoadingScreen';
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
  const [hasLoadedSelectedProfile, setHasLoadedSelectedProfile] = useState(false);
  const auth = useAuth();

  const toggleThemeMode = (): void => {
    setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const hasAttemptedProfileSync = auth.lastProfilesSyncedAt !== null || auth.profileDataError !== null;

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

  const renderScreen = (): React.JSX.Element => {
    switch (activeTab) {
      case 'pipeline':
        return <AutoPilotScreen selectedProfileId={selectedProfileId} theme={theme} />;
      case 'mobile':
        return <MobileDevicesScreen theme={theme} />;
      case 'shopee':
        return (
          <ShopeeScreen
            selectedProfileId={selectedProfileId}
            theme={theme}
            selectedCount={1}
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
        return <LibraryScreen selectedProfileId={selectedProfileId} theme={theme} />;
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
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
