import {
  ChartNoAxesColumn,
  ChevronDown,
  FileText,
  Globe2,
  LogOut,
  Moon,
  RefreshCw,
  Square,
  Sun,
  UserCircle,
  Users,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useAuth } from '@/auth/AuthContext';
import { BACKEND_URL } from '@/auth/constants';
import { formatExpiryLabel, normalizeExpiryDate } from '@/auth/plan';
import type { SyncedProfile, SyncedProfileGroup } from '@/auth/types';
import IconButton from '@/components/ui/IconButton';
import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';

const logoDark = require('../../assets/logo-dark.png');
const logoLight = require('../../assets/logo-light.png');
const headerActionSize = 34;

interface MobileHeaderProps {
  theme: KubdeeTheme;
  runningCount: number;
  profiles: SyncedProfile[];
  profileGroups: SyncedProfileGroup[];
  selectedProfileId: string;
  versionLabel: string;
  isCheckingUpdate: boolean;
  isSyncingProfiles: boolean;
  profileDataError: string | null;
  onCheckUpdate: () => void;
  onChangelogPress: () => void;
  onLogsPress: () => void;
  onProfilePress: () => void;
  onSelectedProfileChange: (profileId: string) => void;
  onThemeModeToggle: () => void;
}

export default function MobileHeader({
  theme,
  runningCount,
  profiles,
  profileGroups,
  selectedProfileId,
  versionLabel,
  isCheckingUpdate,
  isSyncingProfiles,
  profileDataError,
  onCheckUpdate,
  onChangelogPress,
  onLogsPress,
  onProfilePress,
  onSelectedProfileChange,
  onThemeModeToggle,
}: MobileHeaderProps): React.JSX.Element {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileSelectVisible, setProfileSelectVisible] = useState(false);
  const { logout, user } = useAuth();
  const displayName = user?.name || user?.email || 'Kubdee AI User';
  const expiryLabel = formatExpiryLabel(user?.expiryDate);
  const creditsLabel = typeof user?.credits === 'number'
    ? new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(user.credits)
    : '0';
  const devicesLabel = `${user?.activeDevices ?? 0}/${user?.maxDevices ?? 0}`;
  const groupById = useMemo(() => {
    return new Map(profileGroups.map((group) => [group.id, group]));
  }, [profileGroups]);
  const planKey = (user?.plan || 'free').toLowerCase();
  const expiryDateValue = normalizeExpiryDate(user?.expiryDate ?? null);
  const isPlanExpired = expiryDateValue ? expiryDateValue.getTime() < Date.now() : false;
  const maxDevices = user?.maxDevices ?? 0;
  const devicesFull = maxDevices > 0 && (user?.activeDevices ?? 0) >= maxDevices;
  const planTone = getPlanTone(theme, planKey, isPlanExpired);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null;
  const profileSelectEnabled = profiles.length > 0 && !isSyncingProfiles;
  const selectedProfileLabel = selectedProfile
    ? selectedProfile.name
    : isSyncingProfiles
      ? 'กำลังโหลดโปรไฟล์'
      : profileDataError
        ? 'โหลดโปรไฟล์ไม่สำเร็จ'
        : 'ยังไม่มีโปรไฟล์';

  const closeProfileMenu = (): void => setProfileMenuOpen(false);
  const closeProfileSelect = (): void => setProfileSelectVisible(false);

  const openProfileSelect = (): void => {
    if (!profileSelectEnabled) {
      return;
    }

    closeProfileMenu();
    setProfileSelectVisible(true);
  };

  const handleSelectProfile = (profileId: string): void => {
    onSelectedProfileChange(profileId);
    closeProfileSelect();
  };

  const handleManageProfiles = (): void => {
    closeProfileSelect();
    onProfilePress();
  };

  const handleThemeToggle = (): void => {
    onThemeModeToggle();
  };

  const handleOpenWebsite = (): void => {
    closeProfileMenu();
    void Linking.openURL(BACKEND_URL);
  };

  const handleOpenLogs = (): void => {
    closeProfileMenu();
    onLogsPress();
  };

  const handleCheckUpdate = (): void => {
    closeProfileMenu();
    onCheckUpdate();
  };

  const handleOpenChangelog = (): void => {
    closeProfileMenu();
    onChangelogPress();
  };

  const handleOpenProfile = (): void => {
    closeProfileMenu();
    onProfilePress();
  };

  const handleLogout = (): void => {
    closeProfileMenu();
    void logout();
  };

  return (
    <View className="h-[70px] flex-row items-center justify-between border-b border-kd-border px-4">
      <View className="h-12 min-w-0 flex-1 flex-row items-center gap-2.5">
        <Image
          source={theme.isDark ? logoLight : logoDark}
          resizeMode="contain"
          className="h-9 w-9"
        />
        <View className="min-w-0 flex-1 translate-y-[1px] items-start justify-center">
          <Text className="text-kd-title font-extrabold leading-5 text-kd-text" numberOfLines={1}>
            Kubdee AI
          </Text>
          <Pressable
            accessibilityLabel="เลือกโปรไฟล์ทำงาน"
            accessibilityRole="button"
            disabled={!profileSelectEnabled}
            onPress={openProfileSelect}
            className="min-h-[17px] max-w-full flex-row items-center justify-center self-start overflow-hidden pr-1 active:opacity-70 disabled:opacity-70"
          >
            <View className="min-w-0 max-w-full flex-row items-center gap-1">
              <Text
                className="flex-shrink text-kd-caption leading-[13px] text-kd-text-subtle"
                numberOfLines={1}
              >
                {selectedProfileLabel}
              </Text>
              <ChevronDown
                size={12}
                color={theme.textSubtle}
                strokeWidth={2.4}
                style={profileSelectVisible ? { transform: [{ rotate: '180deg' }] } : undefined}
              />
            </View>
          </Pressable>
        </View>
      </View>

      {profileSelectVisible ? (
        <Modal
          animationType="fade"
          onRequestClose={closeProfileSelect}
          transparent
          visible={profileSelectVisible}
        >
          <Pressable className="flex-1" onPress={closeProfileSelect}>
            <Pressable
              onPress={(event) => event.stopPropagation()}
              className="absolute left-[62px] top-[78px] w-[272px] rounded-kd-xl border border-kd-border bg-kd-card p-1.5"
              style={{
                elevation: 10,
                shadowColor: theme.shadow,
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.18,
                shadowRadius: 20,
              }}
            >
              {/* Extension: title + profile count + Users icon header row */}
              <View className="flex-row items-center justify-between px-2 py-1">
                <View>
                  <Text className="text-kd-caption font-bold leading-[15px] text-kd-text">
                    เลือกโปรไฟล์
                  </Text>
                  <Text className="text-kd-tiny font-medium text-kd-text-subtle">
                    {isSyncingProfiles ? 'กำลังซิงก์ข้อมูล' : `${profiles.length} โปรไฟล์พร้อมใช้งาน`}
                  </Text>
                </View>
                <Users size={14} color={theme.textSubtle} strokeWidth={2.4} />
              </View>

              <View className="my-1 h-px bg-kd-border" />

              <ScrollView
                showsVerticalScrollIndicator={false}
                className="max-h-[280px]"
              >
                {profiles.map((profile, index) => {
                  const active = profile.id === selectedProfileId;
                  const group = profile.groupId == null
                    ? null
                    : groupById.get(profile.groupId) ?? null;
                  const initial = (profile.name || 'P').trim().charAt(0).toUpperCase();

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      key={profile.id}
                      onPress={() => handleSelectProfile(profile.id)}
                      className={`min-h-[44px] flex-row items-center gap-2 rounded-kd-lg border px-2 py-1.5 ${
                        index > 0 ? 'mt-1' : ''
                      } ${
                        active
                          ? 'border-kd-border-strong bg-kd-panel-muted dark:bg-kd-card-muted'
                          : 'border-transparent active:bg-kd-panel-muted dark:active:bg-kd-card-muted'
                      }`}
                    >
                      <View
                        className={`h-7 w-7 items-center justify-center rounded-full ${
                          active ? 'bg-[#0a0a0a] dark:bg-white' : 'bg-kd-panel-muted dark:bg-kd-card-muted'
                        }`}
                      >
                        <Text
                          className={`text-kd-caption font-bold ${
                            active ? 'text-white dark:text-[#0a0a0a]' : 'text-kd-text-muted'
                          }`}
                        >
                          {initial}
                        </Text>
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="text-kd-body font-bold leading-4 text-kd-text" numberOfLines={1}>
                          {profile.name}
                        </Text>
                        <Text className="text-kd-tiny font-medium leading-3 text-kd-text-subtle" numberOfLines={1}>
                          {group?.name || 'ไม่มีกลุ่ม'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Extension: full-width dark "จัดการโปรไฟล์" footer button */}
              <Pressable
                accessibilityRole="button"
                onPress={handleManageProfiles}
                className="mt-1.5 h-8 flex-row items-center justify-center gap-1.5 rounded-kd-lg bg-[#0a0a0a] active:opacity-80 dark:bg-white"
              >
                <Users size={14} color={theme.isDark ? '#0a0a0a' : '#ffffff'} strokeWidth={2.5} />
                <Text className="text-kd-caption font-bold text-white dark:text-[#0a0a0a]">
                  จัดการโปรไฟล์
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      <View className="flex-row items-center gap-2">
        {runningCount > 0 ? (
          <IconButton
            icon={Square}
            size={headerActionSize}
            iconSize={14}
            color={theme.red}
            backgroundColor={theme.redSoft}
          />
        ) : null}
        <Pressable
          accessibilityLabel="บัญชีผู้ใช้"
          accessibilityRole="button"
          onPress={() => setProfileMenuOpen(true)}
          className={`h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full border bg-kd-card active:opacity-75 ${
            profileMenuOpen ? 'border-[#0a0a0a] dark:border-white' : 'border-kd-border-strong'
          }`}
        >
          <View className="h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full bg-kd-cyan-soft">
            <UserCircle size={22} color={theme.textSubtle} strokeWidth={2.1} />
            {user?.image ? (
              <Image
                resizeMode="cover"
                source={{ uri: user.image }}
                className="absolute -left-px -top-px h-[34px] w-[34px] rounded-full"
              />
            ) : null}
          </View>
        </Pressable>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={closeProfileMenu}
        transparent
        visible={profileMenuOpen}
      >
        <Pressable className="flex-1" onPress={closeProfileMenu}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            className="absolute right-3 top-[74px] w-[248px] rounded-[12px] border border-gray-100 bg-kd-panel p-1 dark:border-kd-border"
            style={{
              elevation: 10,
              shadowColor: theme.shadow,
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.18,
              shadowRadius: 20,
            }}
          >
            <View className="px-2.5 py-2">
              <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
                {displayName}
              </Text>
              <Text numberOfLines={1} className="mt-px text-kd-micro font-medium text-kd-text-subtle">
                {user?.email || 'Google account'}
              </Text>

              <View className="mt-2 gap-[7px] border-t border-gray-100 pt-2 dark:border-kd-border">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="flex-shrink-0 text-kd-micro font-medium text-kd-text-subtle">Plan</Text>
                  <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: planTone.background }}>
                    <Text className="text-kd-tiny font-extrabold tracking-[0.8px]" style={{ color: planTone.color }}>
                      {(user?.plan || 'FREE').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-center justify-between gap-3">
                  <Text className="flex-shrink-0 text-kd-micro font-medium text-kd-text-subtle">Exp</Text>
                  <Text
                    numberOfLines={1}
                    className={`flex-shrink text-kd-micro font-semibold ${isPlanExpired ? 'text-kd-red' : 'text-kd-text'}`}
                  >
                    {expiryLabel}
                  </Text>
                </View>

                <View className="flex-row items-center justify-between gap-3">
                  <Text className="flex-shrink-0 text-kd-micro font-medium text-kd-text-subtle">Devices</Text>
                  <Text className={`flex-shrink text-kd-micro font-semibold ${devicesFull ? 'text-kd-red' : 'text-kd-text'}`}>
                    {devicesLabel}
                  </Text>
                </View>

                <View className="flex-row items-center justify-between gap-3">
                  <Text className="flex-shrink-0 text-kd-micro font-medium text-kd-text-subtle">Credits</Text>
                  <View className="flex-row items-center gap-1">
                    <GemIcon />
                    <Text className="flex-shrink text-kd-micro font-semibold text-kd-text">{creditsLabel}</Text>
                  </View>
                </View>

                <View className="flex-row items-center justify-between gap-3">
                  <Text className="flex-shrink-0 text-kd-micro font-medium text-kd-text-subtle">Version</Text>
                  <Text className="flex-shrink text-kd-micro font-semibold text-kd-text">{versionLabel}</Text>
                </View>

                <View className="mt-0.5 gap-1.5 border-t border-gray-100 pt-2 dark:border-kd-border">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="flex-shrink-0 text-kd-micro font-medium text-kd-text-subtle">ธีม</Text>
                    <Text className="text-kd-tiny font-medium text-kd-text-subtle">
                      {theme.isDark ? 'มืด' : 'สว่าง'}
                    </Text>
                  </View>
                  <View className="flex-row gap-[3px] rounded-kd-lg bg-kd-panel-muted p-0.5 dark:bg-kd-card-muted">
                    {themeSegmentOptions.map((option) => {
                      const SegmentIcon = option.icon;
                      const isActive = (option.key === 'dark') === theme.isDark;

                      return (
                        <Pressable
                          accessibilityLabel={`ธีม${option.label}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isActive }}
                          key={option.key}
                          onPress={() => {
                            if (!isActive) {
                              handleThemeToggle();
                            }
                          }}
                          className={`h-7 flex-1 flex-row items-center justify-center gap-1 rounded-kd-md ${
                            isActive ? 'bg-white dark:bg-kd-panel-muted' : ''
                          }`}
                        >
                          <SegmentIcon
                            size={12}
                            color={isActive ? theme.text : theme.textSubtle}
                            strokeWidth={2.2}
                          />
                          <Text
                            className={`text-kd-tiny font-bold ${isActive ? 'text-kd-text' : 'text-kd-text-subtle'}`}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            </View>

            <View className="mx-1 my-0.5 h-px bg-gray-100 dark:bg-kd-border" />

            <PopoverMenuButton icon={Users} label="จัดการโปรไฟล์" theme={theme} onPress={handleOpenProfile} />
            <PopoverMenuButton icon={FileText} label="เวอร์ชัน / Changelog" theme={theme} onPress={handleOpenChangelog} />
            <PopoverMenuButton
              icon={RefreshCw}
              label={isCheckingUpdate ? 'กำลังเช็คอัปเดต' : 'เช็คอัปเดต'}
              theme={theme}
              onPress={handleCheckUpdate}
            />
            <PopoverMenuButton icon={ChartNoAxesColumn} label="Logs" theme={theme} onPress={handleOpenLogs} />
            <PopoverMenuButton icon={Globe2} label="ไปเว็บไซต์" theme={theme} onPress={handleOpenWebsite} />
            <PopoverMenuButton danger icon={LogOut} label="ออกจากระบบ" theme={theme} onPress={handleLogout} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const themeSegmentOptions = [
  { key: 'light', label: 'สว่าง', icon: Sun },
  { key: 'dark', label: 'มืด', icon: Moon },
] as const;

/** Extension plan badge tones: ULTRA purple / PRO blue / BASIC green / FREE gray / expired red */
function getPlanTone(
  theme: KubdeeTheme,
  plan: string,
  expired: boolean
): { background: string; color: string } {
  if (expired) {
    return {
      background: alpha('#ef4444', theme.isDark ? 0.24 : 0.12),
      color: theme.isDark ? '#fca5a5' : '#b91c1c',
    };
  }

  switch (plan) {
    case 'ultra':
      return {
        background: alpha('#a855f7', theme.isDark ? 0.24 : 0.14),
        color: theme.isDark ? '#d8b4fe' : '#7e22ce',
      };
    case 'pro':
      return {
        background: alpha('#3b82f6', theme.isDark ? 0.24 : 0.12),
        color: theme.isDark ? '#93c5fd' : '#1d4ed8',
      };
    case 'basic':
      return {
        background: alpha('#22c55e', theme.isDark ? 0.24 : 0.12),
        color: theme.isDark ? '#86efac' : '#15803d',
      };
    default:
      return {
        background: theme.isDark ? theme.cardMuted : theme.panelMuted,
        color: theme.textSubtle,
      };
  }
}

/** Extension credits gem: amber gradient diamond */
function GemIcon(): React.JSX.Element {
  return (
    <Svg height={12} viewBox="0 0 24 24" width={12}>
      <Defs>
        <LinearGradient id="gem-gradient" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFD93D" />
          <Stop offset="0.5" stopColor="#F59E0B" />
          <Stop offset="1" stopColor="#D97706" />
        </LinearGradient>
      </Defs>
      <Path d="M6 2L1 9L12 22L23 9L18 2H6Z" fill="url(#gem-gradient)" />
    </Svg>
  );
}

interface PopoverMenuButtonProps {
  icon: typeof LogOut;
  label: string;
  theme: KubdeeTheme;
  danger?: boolean;
  onPress: () => void;
}

/** Extension account menu item: flat centered row, hover wash */
function PopoverMenuButton({
  icon: Icon,
  label,
  theme,
  danger = false,
  onPress,
}: PopoverMenuButtonProps): React.JSX.Element {
  const color = danger ? theme.red : theme.textMuted;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`h-[34px] flex-row items-center justify-center gap-2 rounded-kd-lg ${
        danger
          ? 'active:bg-kd-red/10'
          : 'active:bg-kd-panel-muted dark:active:bg-kd-card-muted'
      }`}
    >
      <Icon size={14} color={color} strokeWidth={2.3} />
      <Text className={`text-kd-body font-semibold ${danger ? 'text-kd-red' : 'text-kd-text-muted'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
