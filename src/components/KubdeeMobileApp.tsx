import { StatusBar } from 'expo-status-bar';
import { colorScheme as nativeWindColorScheme } from 'nativewind';
import { useEffect, useMemo, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

export default function KubdeeMobileApp(): React.JSX.Element {
  const colorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    colorScheme === 'light' ? 'light' : 'dark'
  );
  const theme = useMemo(() => (themeMode === 'light' ? lightTheme : darkTheme), [themeMode]);

  // Keep NativeWind's dark: variants and CSS vars in sync with the
  // in-app theme toggle (single source of truth stays in themeMode).
  useEffect(() => {
    nativeWindColorScheme.set(themeMode);
  }, [themeMode]);

  const [activeTab, setActiveTab] = useState<TabId>('pipeline');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set(['local-android']));
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const auth = useAuth();

  const toggleThemeMode = (): void => {
    setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const toggleDevice = (deviceId: string): void => {
    setSelectedDeviceIds((current) => {
      const next = new Set(current);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  };

  const hasAttemptedProfileSync = auth.lastProfilesSyncedAt !== null || auth.profileDataError !== null;

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
    const hasSelectedProfile = auth.syncedProfiles.some((profile) => profile.id === selectedProfileId);
    const nextProfileId = hasSelectedProfile ? selectedProfileId : auth.syncedProfiles[0]?.id ?? '';

    if (nextProfileId !== selectedProfileId) {
      setSelectedProfileId(nextProfileId);
    }
  }, [auth.syncedProfiles, selectedProfileId]);

  const renderScreen = (): React.JSX.Element => {
    switch (activeTab) {
      case 'pipeline':
        return <AutoPilotScreen selectedProfileId={selectedProfileId} theme={theme} />;
      case 'mobile':
        return (
          <MobileDevicesScreen
            selectedDeviceIds={selectedDeviceIds}
            theme={theme}
            onToggleDevice={toggleDevice}
          />
        );
      case 'shopee':
        return (
          <ShopeeScreen
            selectedProfileId={selectedProfileId}
            theme={theme}
            selectedCount={selectedDeviceIds.size}
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
        return <MobileDevicesScreen selectedDeviceIds={selectedDeviceIds} theme={theme} onToggleDevice={toggleDevice} />;
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
