import {
  ChartNoAxesColumn,
  ChevronDown,
  Globe2,
  LogOut,
  Moon,
  Square,
  Sun,
  UserCircle,
  Users,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import packageJson from '../../package.json';

import { useAuth } from '@/auth/AuthContext';
import { BACKEND_URL } from '@/auth/constants';
import { formatExpiryLabel, normalizeExpiryDate } from '@/auth/plan';
import type { SyncedProfile, SyncedProfileGroup } from '@/auth/types';
import IconButton from '@/components/ui/IconButton';
import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha, radii, typography } from '@/theme/tokens';

const logoDark = require('../../assets/logo-dark.png');
const logoLight = require('../../assets/logo-light.png');
const headerActionIconSize = 17;
const headerActionSize = 34;

function formatShortId(value: string): string {
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function getSourceLabel(value?: string | null): string {
  switch ((value || 'unknown').toLowerCase()) {
    case 'desktop':
      return 'Desktop';
    case 'extension':
      return 'Extension';
    case 'mobile':
      return 'Mobile';
    case 'web':
      return 'Web';
    default:
      return 'Cloud';
  }
}

interface MobileHeaderProps {
  theme: KubdeeTheme;
  runningCount: number;
  profiles: SyncedProfile[];
  profileGroups: SyncedProfileGroup[];
  selectedProfileId: string;
  isSyncingProfiles: boolean;
  profileDataError: string | null;
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
  isSyncingProfiles,
  profileDataError,
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
  const popoverDivider = theme.isDark ? theme.border : '#f3f4f6';
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

  const handleOpenProfile = (): void => {
    closeProfileMenu();
    onProfilePress();
  };

  const handleLogout = (): void => {
    closeProfileMenu();
    void logout();
  };

  return (
    <View style={[styles.container, { borderBottomColor: theme.border }]}>
      <View style={styles.identity}>
        <Image
          source={theme.isDark ? logoLight : logoDark}
          resizeMode="contain"
          style={styles.logo}
        />
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            Kubdee AI
          </Text>
          <Pressable
            accessibilityLabel="เลือกโปรไฟล์ทำงาน"
            accessibilityRole="button"
            disabled={!profileSelectEnabled}
            onPress={openProfileSelect}
            style={({ pressed }) => [
              styles.profileSelectButton,
              {
                opacity: pressed ? 0.72 : profileSelectEnabled ? 1 : 0.72,
              },
            ]}
          >
            <View style={styles.profileSelectContent}>
              <Text
                style={[
                  styles.profileSelectText,
                  { color: theme.textSubtle },
                ]}
                numberOfLines={1}
              >
                {selectedProfileLabel}
              </Text>
              <ChevronDown size={12} color={theme.textSubtle} strokeWidth={2.4} />
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
          <Pressable style={styles.popoverBackdrop} onPress={closeProfileSelect}>
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={[
                styles.profileSelectPopover,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  shadowColor: theme.shadow,
                },
              ]}
            >
              <Text style={[styles.profileSelectTitle, { color: theme.text }]}>
                เลือกโปรไฟล์ทำงาน
              </Text>
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={styles.profileSelectList}
              >
                {profiles.map((profile) => {
                  const active = profile.id === selectedProfileId;
                  const group = profile.groupId == null
                    ? null
                    : groupById.get(profile.groupId) ?? null;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={profile.id}
                      onPress={() => handleSelectProfile(profile.id)}
                      style={({ pressed }) => [
                        styles.profileSelectOption,
                        {
                          backgroundColor: active ? theme.cyanSoft : theme.cardMuted,
                          borderColor: active ? alpha(theme.cyan, 0.38) : theme.border,
                          opacity: pressed ? 0.76 : 1,
                        },
                      ]}
                    >
                      <View style={styles.profileSelectOptionBody}>
                        <Text style={[styles.profileSelectOptionName, { color: theme.text }]} numberOfLines={1}>
                          {profile.name}
                        </Text>
                        <Text style={[styles.profileSelectOptionMeta, { color: theme.textSubtle }]} numberOfLines={1}>
                          {group?.name || 'ไม่มีกลุ่ม'} · {getSourceLabel(profile.createdByApp || profile.originApp)} · {formatShortId(profile.id)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      <View style={styles.actions}>
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
          style={({ pressed }) => [
            styles.avatarButton,
            {
              backgroundColor: theme.card,
              borderColor: profileMenuOpen ? (theme.isDark ? theme.white : '#0a0a0a') : theme.borderStrong,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <View style={[styles.avatarFallback, { backgroundColor: theme.cyanSoft }]}>
            <UserCircle size={22} color={theme.textSubtle} strokeWidth={2.1} />
            {user?.image ? (
              <Image resizeMode="cover" source={{ uri: user.image }} style={styles.avatarImage} />
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
        <Pressable style={styles.popoverBackdrop} onPress={closeProfileMenu}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[
              styles.profilePopover,
              {
                backgroundColor: theme.panel,
                borderColor: popoverDivider,
                shadowColor: theme.shadow,
              },
            ]}
          >
            <View style={styles.popoverInfo}>
              <Text numberOfLines={1} style={[styles.popoverName, { color: theme.text }]}>
                {displayName}
              </Text>
              <Text numberOfLines={1} style={[styles.popoverEmail, { color: theme.textSubtle }]}>
                {user?.email || 'Google account'}
              </Text>

              <View style={[styles.popoverMetaBlock, { borderTopColor: popoverDivider }]}>
                <View style={styles.popoverMetaRow}>
                  <Text style={[styles.popoverMetaLabel, { color: theme.textSubtle }]}>Plan</Text>
                  <View style={[styles.planBadge, { backgroundColor: planTone.background }]}>
                    <Text style={[styles.planBadgeText, { color: planTone.color }]}>
                      {(user?.plan || 'FREE').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.popoverMetaRow}>
                  <Text style={[styles.popoverMetaLabel, { color: theme.textSubtle }]}>Exp</Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.popoverMetaValue, { color: isPlanExpired ? theme.red : theme.text }]}
                  >
                    {expiryLabel}
                  </Text>
                </View>

                <View style={styles.popoverMetaRow}>
                  <Text style={[styles.popoverMetaLabel, { color: theme.textSubtle }]}>Devices</Text>
                  <Text style={[styles.popoverMetaValue, { color: devicesFull ? theme.red : theme.text }]}>
                    {devicesLabel}
                  </Text>
                </View>

                <View style={styles.popoverMetaRow}>
                  <Text style={[styles.popoverMetaLabel, { color: theme.textSubtle }]}>Credits</Text>
                  <View style={styles.popoverCreditsValue}>
                    <GemIcon />
                    <Text style={[styles.popoverMetaValue, { color: theme.text }]}>{creditsLabel}</Text>
                  </View>
                </View>

                <View style={styles.popoverMetaRow}>
                  <Text style={[styles.popoverMetaLabel, { color: theme.textSubtle }]}>Version</Text>
                  <Text style={[styles.popoverMetaValue, { color: theme.text }]}>v{packageJson.version}</Text>
                </View>

                <View style={[styles.popoverThemeBlock, { borderTopColor: popoverDivider }]}>
                  <View style={styles.popoverMetaRow}>
                    <Text style={[styles.popoverMetaLabel, { color: theme.textSubtle }]}>ธีม</Text>
                    <Text style={[styles.popoverMetaHint, { color: theme.textSubtle }]}>
                      {theme.isDark ? 'มืด' : 'สว่าง'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.themeSegments,
                      { backgroundColor: theme.isDark ? theme.cardMuted : theme.panelMuted },
                    ]}
                  >
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
                          style={[
                            styles.themeSegment,
                            isActive
                              ? { backgroundColor: theme.isDark ? theme.panelMuted : theme.white }
                              : null,
                          ]}
                        >
                          <SegmentIcon
                            size={12}
                            color={isActive ? theme.text : theme.textSubtle}
                            strokeWidth={2.2}
                          />
                          <Text
                            style={[
                              styles.themeSegmentText,
                              { color: isActive ? theme.text : theme.textSubtle },
                            ]}
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

            <View style={[styles.menuDivider, { backgroundColor: popoverDivider }]} />

            <PopoverMenuButton icon={Users} label="จัดการโปรไฟล์" theme={theme} onPress={handleOpenProfile} />
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
      style={({ pressed }) => [
        styles.popoverMenuButton,
        pressed
          ? {
              backgroundColor: danger
                ? alpha(theme.red, theme.isDark ? 0.14 : 0.07)
                : theme.isDark
                  ? theme.cardMuted
                  : theme.panelMuted,
            }
          : null,
      ]}
    >
      <Icon size={14} color={color} strokeWidth={2.3} />
      <Text style={[styles.popoverMenuLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  avatarButton: {
    alignItems: 'center',
    borderRadius: headerActionSize / 2,
    borderWidth: 1,
    height: headerActionSize,
    justifyContent: 'center',
    overflow: 'hidden',
    width: headerActionSize,
  },
  avatarFallback: {
    alignItems: 'center',
    borderRadius: headerActionSize / 2,
    height: headerActionSize,
    justifyContent: 'center',
    overflow: 'hidden',
    width: headerActionSize,
  },
  avatarImage: {
    borderRadius: headerActionSize / 2,
    height: headerActionSize,
    left: -1,
    position: 'absolute',
    top: -1,
    width: headerActionSize,
  },
  container: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    height: 70,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  identity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    height: 48,
    minWidth: 0,
  },
  logo: {
    height: 36,
    width: 36,
  },
  menuDivider: {
    height: 1,
    marginHorizontal: 4,
    marginVertical: 2,
  },
  planBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  planBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    includeFontPadding: false,
    letterSpacing: 0.8,
  },
  popoverBackdrop: {
    flex: 1,
  },
  popoverCreditsValue: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  popoverEmail: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  popoverInfo: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  popoverMenuButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    height: 34,
    justifyContent: 'center',
  },
  popoverMenuLabel: {
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
  },
  popoverMetaBlock: {
    borderTopWidth: 1,
    gap: 7,
    marginTop: 8,
    paddingTop: 8,
  },
  popoverMetaHint: {
    fontSize: 9,
    fontWeight: '500',
  },
  popoverMetaLabel: {
    flexShrink: 0,
    fontSize: 10,
    fontWeight: '500',
  },
  popoverMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  popoverMetaValue: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '600',
    includeFontPadding: false,
  },
  popoverName: {
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
  },
  popoverThemeBlock: {
    borderTopWidth: 1,
    gap: 6,
    marginTop: 2,
    paddingTop: 8,
  },
  profilePopover: {
    borderRadius: 12,
    borderWidth: 1,
    elevation: 10,
    padding: 4,
    position: 'absolute',
    right: 12,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    top: 74,
    width: 248,
  },
  profileSelectButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    minHeight: 17,
    justifyContent: 'center',
    marginTop: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    paddingRight: 4,
  },
  profileSelectContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    minWidth: 0,
    maxWidth: '100%',
  },
  profileSelectList: {
    maxHeight: 260,
  },
  profileSelectOption: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 7,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  profileSelectOptionBody: {
    flex: 1,
    minWidth: 0,
  },
  profileSelectOptionMeta: {
    fontSize: typography.tiny,
    fontWeight: '700',
    marginTop: 2,
  },
  profileSelectOptionName: {
    fontSize: typography.body,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 16,
  },
  profileSelectPopover: {
    borderRadius: radii.lg,
    borderWidth: 1,
    elevation: 10,
    left: 108,
    padding: 9,
    position: 'absolute',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    top: 78,
    width: 268,
  },
  profileSelectText: {
    flexShrink: 1,
    fontSize: typography.caption,
    fontWeight: '400',
    includeFontPadding: false,
    lineHeight: 13,
  },
  profileSelectTitle: {
    fontSize: typography.caption,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 15,
  },
  themeSegment: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    height: 28,
    justifyContent: 'center',
  },
  themeSegments: {
    borderRadius: 8,
    flexDirection: 'row',
    gap: 3,
    padding: 2,
  },
  themeSegmentText: {
    fontSize: 9,
    fontWeight: '700',
    includeFontPadding: false,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '800',
    includeFontPadding: false,
    letterSpacing: 0,
    lineHeight: 20,
  },
  titleBlock: {
    alignItems: 'flex-start',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    transform: [{ translateY: 1 }],
  },
});
