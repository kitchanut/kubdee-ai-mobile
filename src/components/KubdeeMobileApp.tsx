import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MobileHeader from '@/components/MobileHeader';
import TopIconTabs from '@/components/TopIconTabs';
import PlaceholderScreen from '@/screens/PlaceholderScreen';
import LibraryScreen from '@/screens/LibraryScreen';
import LogsScreen from '@/screens/LogsScreen';
import MobileDevicesScreen from '@/screens/MobileDevicesScreen';
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
  const [activeTab, setActiveTab] = useState<TabId>('shopee');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set(['local-android']));

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

  const renderScreen = (): React.JSX.Element => {
    switch (activeTab) {
      case 'mobile':
        return (
          <MobileDevicesScreen
            selectedDeviceIds={selectedDeviceIds}
            theme={theme}
            onToggleDevice={toggleDevice}
          />
        );
      case 'shopee':
        return <ShopeeScreen theme={theme} selectedCount={selectedDeviceIds.size} />;
      case 'logs':
        return <LogsScreen theme={theme} />;
      case 'profile':
        return <ProfileScreen theme={theme} />;
      case 'tiktok':
        return <PlaceholderScreen theme={theme} title="TikTok" accent="cyan" />;
      case 'youtube':
        return <PlaceholderScreen theme={theme} title="YouTube" accent="red" />;
      case 'facebook':
        return <PlaceholderScreen theme={theme} title="Facebook" accent="blue" />;
      case 'library':
        return <LibraryScreen theme={theme} />;
      default:
        return <MobileDevicesScreen selectedDeviceIds={selectedDeviceIds} theme={theme} onToggleDevice={toggleDevice} />;
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.screen }]}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={[styles.shell, { backgroundColor: theme.panel }]}>
          <MobileHeader
            libraryActive={activeTab === 'library'}
            runningCount={0}
            subtitle={activeTab === 'library' ? 'คลัง' : 'Shopee หลัก'}
            theme={theme}
            onLibraryPress={() => setActiveTab('library')}
            onThemeModeToggle={toggleThemeMode}
          />
          <TopIconTabs activeTab={activeTab} theme={theme} onTabChange={setActiveTab} />
          <View style={styles.content}>{renderScreen()}</View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    minHeight: 0,
  },
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  shell: {
    flex: 1,
  },
});
