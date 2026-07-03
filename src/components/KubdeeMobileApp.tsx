import { StatusBar } from 'expo-status-bar';
import { colorScheme as nativeWindColorScheme } from 'nativewind';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  pushAutomationActivityLog,
  useAutomationActivityNativeBridge,
} from '@/activity/automationActivityLogStore';
import GoogleFlowWebViewRunnerHost from '@/autopilot/GoogleFlowWebViewRunnerHost';
import { useAuth } from '@/auth/AuthContext';
import MobileChangelogModal from '@/components/MobileChangelogModal';
import MobileHeader from '@/components/MobileHeader';
import TopIconTabs from '@/components/TopIconTabs';
import Text from '@/components/ui/KubdeeText';
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
import {
  isThemeMode,
  resolveThemeMode,
  THEME_MODE_SEQUENCE,
  type ThemeMode,
} from '@/theme/mode';
import { darkTheme, lightTheme } from '@/theme/tokens';
import type { TabId } from '@/types/navigation';
import { CURRENT_CHANGELOG_VERSION } from '@/updates/mobileChangelog';
import {
  checkMobileUpdate,
  downloadAndOpenMobileUpdate,
  getCurrentMobileVersionLabel,
  getReleaseNotes,
  openAndroidInstallPermissionSettings,
  type MobileRelease,
  type MobileUpdateResult,
} from '@/updates/mobileUpdate';

interface UpdateDownloadState {
  visible: boolean;
  progress: number | null;
  detail: string;
}

const SELECTED_PROFILE_STORAGE_KEY = 'kubdee_ai_mobile_selected_profile_id';
const SEEN_CHANGELOG_STORAGE_KEY = 'kubdee_ai_mobile_seen_changelog_version';
const THEME_MODE_STORAGE_KEY = 'kubdee_ai_mobile_theme_mode';

function selectedProfileStorageKey(userId: string | null | undefined): string {
  const cleanUserId = userId?.trim();
  return cleanUserId ? `${SELECTED_PROFILE_STORAGE_KEY}:${cleanUserId}` : SELECTED_PROFILE_STORAGE_KEY;
}

function uniqueProductIds(productIds: string[]): string[] {
  return Array.from(new Set(productIds.map((productId) => productId.trim()).filter(Boolean)));
}

function uniqueVideoIds(videoIds: string[]): string[] {
  return Array.from(new Set(videoIds.map((videoId) => videoId.trim()).filter(Boolean)));
}

function areSameProductIds(first: string[], second: string[]): boolean {
  if (first.length !== second.length) {
    return false;
  }

  return first.every((productId, index) => productId === second[index]);
}

export default function KubdeeMobileApp(): React.JSX.Element {
  const colorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const resolvedThemeMode = useMemo(
    () => resolveThemeMode(themeMode, colorScheme),
    [colorScheme, themeMode]
  );
  const theme = useMemo(() => (resolvedThemeMode === 'light' ? lightTheme : darkTheme), [resolvedThemeMode]);
  useAutomationActivityNativeBridge();

  // Keep NativeWind's dark: variants and CSS vars in sync with the
  // in-app theme toggle (single source of truth stays in themeMode).
  useEffect(() => {
    nativeWindColorScheme.set(resolvedThemeMode);
  }, [resolvedThemeMode]);

  const [activeTab, setActiveTab] = useState<TabId>('pipeline');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [autoPilotSelectedProductIdsByProfile, setAutoPilotSelectedProductIdsByProfile] =
    useState<Record<string, string[]>>({});
  const [autoPilotSelectionRequest, setAutoPilotSelectionRequest] =
    useState<AutoPilotProductSelectionRequest | null>(null);
  const [pendingShopeeVideoIds, setPendingShopeeVideoIds] = useState<string[]>([]);
  const [libraryTabRequest, setLibraryTabRequest] =
    useState<{ tab: 'videos'; requestId: number } | null>(null);
  const [hasLoadedSelectedProfile, setHasLoadedSelectedProfile] = useState(false);
  const [isCheckingMobileUpdate, setIsCheckingMobileUpdate] = useState(false);
  const [changelogVisible, setChangelogVisible] = useState(false);
  const [hasCheckedChangelog, setHasCheckedChangelog] = useState(false);
  const [updateDownloadState, setUpdateDownloadState] = useState<UpdateDownloadState>({
    visible: false,
    progress: null,
    detail: '',
  });
  const promptedMobileUpdateIdRef = useRef('');
  const auth = useAuth();
  const { importShopeeProducts, refreshProducts } = useLibrary();
  const mobileVersionLabel = useMemo(() => getCurrentMobileVersionLabel(), []);

  const appendRecoveredShopeeLog = useCallback((message: string, ts = Date.now()): void => {
    pushAutomationActivityLog('shopee-import', message, ts);
  }, []);

  useShopeeIncrementalProductSaver({
    selectedProfileId,
    importShopeeProducts,
    appendLog: appendRecoveredShopeeLog,
    onProductsChanged: refreshProducts,
  });

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(THEME_MODE_STORAGE_KEY)
      .then((storedMode) => {
        if (active && isThemeMode(storedMode)) {
          setThemeMode(storedMode);
        }
      })
      .catch(() => {
        // Keep system mode when stored preference is unavailable.
      });

    return () => {
      active = false;
    };
  }, []);

  const updateThemeMode = useCallback((nextMode: ThemeMode): void => {
    setThemeMode(nextMode);
    void AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode);
  }, []);

  const toggleThemeMode = (): void => {
    setThemeMode((current) => {
      const currentIndex = THEME_MODE_SEQUENCE.indexOf(current);
      const nextMode = THEME_MODE_SEQUENCE[(currentIndex + 1) % THEME_MODE_SEQUENCE.length] ?? 'system';
      void AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode);
      return nextMode;
    });
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
    const userId = auth.user?.id?.trim() || '';

    if (!userId) {
      setSelectedProfileId('');
      setHasLoadedSelectedProfile(true);
      return () => {
        active = false;
      };
    }

    setHasLoadedSelectedProfile(false);

    AsyncStorage.getItem(selectedProfileStorageKey(userId))
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
  }, [auth.user?.id]);

  useEffect(() => {
    if (!hasLoadedSelectedProfile) {
      return;
    }

    const userId = auth.user?.id?.trim();
    if (!userId) {
      void AsyncStorage.removeItem(SELECTED_PROFILE_STORAGE_KEY);
      return;
    }

    if (selectedProfileId) {
      void AsyncStorage.setItem(selectedProfileStorageKey(userId), selectedProfileId);
      void AsyncStorage.removeItem(SELECTED_PROFILE_STORAGE_KEY);
      return;
    }

    void AsyncStorage.removeItem(selectedProfileStorageKey(userId));
  }, [auth.user?.id, hasLoadedSelectedProfile, selectedProfileId]);

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

  const sendVideosToShopee = useCallback((videoIds: string[]): void => {
    const cleanVideoIds = uniqueVideoIds(videoIds);
    if (cleanVideoIds.length === 0) {
      return;
    }

    setPendingShopeeVideoIds((current) => {
      const existing = new Set(current);
      return [...current, ...cleanVideoIds.filter((videoId) => !existing.has(videoId))];
    });
    setActiveTab('shopee');
  }, []);

  const removePendingShopeeVideo = useCallback((videoId: string): void => {
    setPendingShopeeVideoIds((current) => current.filter((id) => id !== videoId));
  }, []);

  const clearPendingShopeeVideos = useCallback((): void => {
    setPendingShopeeVideoIds([]);
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

  const openMobileChangelog = useCallback((): void => {
    setChangelogVisible(true);
  }, []);

  const closeMobileChangelog = useCallback((): void => {
    setChangelogVisible(false);
    void AsyncStorage.setItem(SEEN_CHANGELOG_STORAGE_KEY, CURRENT_CHANGELOG_VERSION);
  }, []);

  useEffect(() => {
    if (hasCheckedChangelog || auth.isLoading || !auth.user || !auth.token) {
      return;
    }

    let active = true;

    AsyncStorage.getItem(SEEN_CHANGELOG_STORAGE_KEY)
      .then((seenVersion) => {
        if (active && seenVersion !== CURRENT_CHANGELOG_VERSION) {
          setChangelogVisible(true);
        }
      })
      .catch(() => {
        if (active) {
          setChangelogVisible(true);
        }
      })
      .finally(() => {
        if (active) {
          setHasCheckedChangelog(true);
        }
      });

    return () => {
      active = false;
    };
  }, [auth.isLoading, auth.token, auth.user, hasCheckedChangelog]);

  const startMobileUpdateDownload = useCallback(
    async (release: MobileRelease): Promise<void> => {
      if (!auth.token) {
        Alert.alert('ยังไม่ได้เข้าสู่ระบบ', 'กรุณาเข้าสู่ระบบก่อนดาวน์โหลดอัปเดต');
        return;
      }

      setUpdateDownloadState({
        visible: true,
        progress: 0,
        detail: 'กำลังเตรียมดาวน์โหลด...',
      });

      try {
        await downloadAndOpenMobileUpdate(auth.token, release, {
          onProgress: ({ progress }) => {
            const safeProgress = progress == null ? null : Math.max(0, Math.min(1, progress));
            setUpdateDownloadState({
              visible: true,
              progress: safeProgress,
              detail:
                safeProgress == null
                  ? 'กำลังดาวน์โหลดอัปเดต...'
                  : `กำลังดาวน์โหลด ${Math.round(safeProgress * 100)}%`,
            });
          },
        });
        setUpdateDownloadState({
          visible: true,
          progress: 1,
          detail: 'กำลังเปิดหน้าติดตั้ง...',
        });
        setTimeout(() => {
          setUpdateDownloadState({ visible: false, progress: null, detail: '' });
        }, 1200);
      } catch (error) {
        setUpdateDownloadState({ visible: false, progress: null, detail: '' });
        const message = error instanceof Error ? error.message : 'ดาวน์โหลดอัปเดตไม่สำเร็จ';
        const shouldOpenSettings = /ติดตั้ง|อนุญาต|install|permission/i.test(message);

        Alert.alert(
          'อัปเดตไม่สำเร็จ',
          message,
          shouldOpenSettings
            ? [
                { text: 'ปิด', style: 'cancel' },
                {
                  text: 'เปิดการตั้งค่า',
                  onPress: () => {
                    void openAndroidInstallPermissionSettings();
                  },
                },
              ]
            : undefined
        );
      }
    },
    [auth.token]
  );

  const promptMobileUpdate = useCallback(
    (result: MobileUpdateResult): void => {
      const latest = result.latest;
      if (!latest) {
        return;
      }

      const releaseNotes = getReleaseNotes(latest);
      const lines = [
        `เครื่องนี้ ${getCurrentMobileVersionLabel()}`,
        `เวอร์ชันล่าสุด v${latest.version}`,
        releaseNotes.length > 0 ? `\nมีอะไรใหม่:\n${releaseNotes.map((note) => `- ${note}`).join('\n')}` : '',
        '\nหลังดาวน์โหลด ระบบจะพาไปขั้นตอนติดตั้งเวอร์ชันใหม่',
      ].filter(Boolean);

      Alert.alert(
        result.forceUpdate ? 'ต้องอัปเดตแอป' : 'มีอัปเดตใหม่',
        lines.join('\n'),
        result.forceUpdate
          ? [
              {
                text: 'ดาวน์โหลดอัปเดต',
                onPress: () => {
                  void startMobileUpdateDownload(latest);
                },
              },
            ]
          : [
              { text: 'ภายหลัง', style: 'cancel' },
              {
                text: 'ดาวน์โหลด',
                onPress: () => {
                  void startMobileUpdateDownload(latest);
                },
              },
            ],
        { cancelable: !result.forceUpdate }
      );
    },
    [startMobileUpdateDownload]
  );

  const checkForMobileUpdate = useCallback(
    async (manual = false): Promise<void> => {
      if (!auth.token) {
        if (manual) {
          Alert.alert('ยังไม่ได้เข้าสู่ระบบ', 'กรุณาเข้าสู่ระบบก่อนเช็คอัปเดต');
        }
        return;
      }

      setIsCheckingMobileUpdate(true);
      try {
        const result = await checkMobileUpdate(auth.token);

        if (!result.latest) {
          if (manual) {
            Alert.alert('ยังไม่มีไฟล์อัปเดต', 'ยังไม่พบ release ของ Kubdee AI Mobile บน kubdee.ai');
          }
          return;
        }

        if (!result.hasUpdate && !result.forceUpdate) {
          if (manual) {
            Alert.alert('เวอร์ชันล่าสุดแล้ว', `เครื่องนี้ใช้ ${getCurrentMobileVersionLabel()} อยู่`);
          }
          return;
        }

        if (!manual && promptedMobileUpdateIdRef.current === result.latest.id) {
          return;
        }

        promptedMobileUpdateIdRef.current = result.latest.id;
        promptMobileUpdate(result);
      } catch (error) {
        if (manual) {
          const message = error instanceof Error ? error.message : 'เช็คอัปเดตไม่สำเร็จ';
          Alert.alert('เช็คอัปเดตไม่สำเร็จ', message);
        }
      } finally {
        setIsCheckingMobileUpdate(false);
      }
    },
    [auth.token, promptMobileUpdate]
  );

  useEffect(() => {
    if (!auth.token || !auth.user || auth.isLoading) {
      return;
    }

    const timer = setTimeout(() => {
      void checkForMobileUpdate(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [auth.isLoading, auth.token, auth.user, checkForMobileUpdate]);

  const downloadProgressPercent = updateDownloadState.progress == null
    ? null
    : Math.round(updateDownloadState.progress * 100);
  const updateModalAccent = theme.isDark ? '#f9fafb' : '#111827';
  const updateModalTrack = theme.isDark ? '#374151' : '#e5e7eb';
  const updateModalBackdrop = theme.isDark ? 'rgba(0, 0, 0, 0.72)' : 'rgba(17, 24, 39, 0.45)';

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
            pendingVideoIds={pendingShopeeVideoIds}
            selectedProfileId={selectedProfileId}
            theme={theme}
            onClearPendingVideos={clearPendingShopeeVideos}
            onOpenVideoLibrary={() => {
              setLibraryTabRequest({ tab: 'videos', requestId: Date.now() });
              setActiveTab('library');
            }}
            onRemovePendingVideo={removePendingShopeeVideo}
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
            initialTabRequest={libraryTabRequest}
            selectedProfileId={selectedProfileId}
            theme={theme}
            onSendProductsToAutoPilot={sendProductsToAutoPilot}
            onSendVideosToShopee={sendVideosToShopee}
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
              themeMode={themeMode}
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
                isCheckingUpdate={isCheckingMobileUpdate}
                isSyncingProfiles={auth.isSyncingProfiles}
                profileDataError={auth.profileDataError}
                profileGroups={auth.syncedProfileGroups}
                profiles={auth.syncedProfiles}
                runningCount={0}
                selectedProfileId={selectedProfileId}
                theme={theme}
                themeMode={themeMode}
                versionLabel={mobileVersionLabel}
                onChangelogPress={openMobileChangelog}
                onCheckUpdate={() => {
                  void checkForMobileUpdate(true);
                }}
                onProfilePress={() => setActiveTab('profile')}
                onSelectedProfileChange={setSelectedProfileId}
                onThemeModeChange={updateThemeMode}
              />
              <TopIconTabs activeTab={activeTab} theme={theme} onTabChange={setActiveTab} />
              <View className="min-h-0 flex-1">{renderScreen()}</View>
              <GoogleFlowWebViewRunnerHost theme={theme} />
            </>
          )}
        </View>
      </SafeAreaView>
      <MobileChangelogModal
        authToken={auth.token}
        theme={theme}
        versionLabel={mobileVersionLabel}
        visible={changelogVisible}
        onClose={closeMobileChangelog}
      />
      <Modal animationType="fade" transparent visible={updateDownloadState.visible}>
        <View
          className="flex-1 items-center justify-center px-6"
          style={{ backgroundColor: updateModalBackdrop }}
        >
          <View
            className="w-full max-w-[320px] rounded-[12px] border border-kd-border bg-kd-panel p-5"
            style={{
              shadowColor: theme.shadow,
              shadowOffset: { width: 0, height: 18 },
              shadowOpacity: 0.24,
              shadowRadius: 28,
              elevation: 18,
            }}
          >
            <View className="mb-4 flex-row items-center gap-3">
              <ActivityIndicator color={updateModalAccent} />
              <View className="min-w-0 flex-1">
                <Text className="text-base font-semibold text-kd-text">
                  กำลังอัปเดตแอป
                </Text>
                <Text className="mt-1 text-kd-caption leading-[17px] text-kd-text-subtle">
                  {updateDownloadState.detail || 'กำลังดำเนินการ...'}
                </Text>
              </View>
            </View>
            <View
              className="h-2 overflow-hidden rounded-full"
              style={{ backgroundColor: updateModalTrack }}
            >
              <View
                className="h-full rounded-full"
                style={{
                  width: downloadProgressPercent == null ? '45%' : `${downloadProgressPercent}%`,
                  backgroundColor: updateModalAccent,
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
