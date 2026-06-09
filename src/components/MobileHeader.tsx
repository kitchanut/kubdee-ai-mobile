import {
  ChartNoAxesColumn,
  ChevronDown,
  Coins,
  CreditCard,
  ExternalLink,
  HardDrive,
  LogOut,
  Moon,
  Square,
  Sun,
  UserCircle,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { BACKEND_URL } from '@/auth/constants';
import { formatExpiryLabel, formatPlanLabel } from '@/auth/plan';
import type { SyncedProfile, SyncedProfileGroup } from '@/auth/types';
import IconButton from '@/components/ui/IconButton';
import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha, radii, spacing, typography } from '@/theme/tokens';

const logoDark = require('../../assets/logo-dark.png');
const logoLight = require('../../assets/logo-light.png');
const headerActionIconSize = 17;
const headerActionSize = 34;

interface MobileHeaderProps {
  theme: KubdeeTheme;
  runningCount: number;
  profiles: SyncedProfile[];
  profileGroups: SyncedProfileGroup[];
  selectedProfileLocalId: string;
  isSyncingProfiles: boolean;
  profileDataError: string | null;
  onLogsPress: () => void;
  onProfilePress: () => void;
  onSelectedProfileChange: (profileLocalId: string) => void;
  onThemeModeToggle: () => void;
}

export default function MobileHeader({
  theme,
  runningCount,
  profiles,
  profileGroups,
  selectedProfileLocalId,
  isSyncingProfiles,
  profileDataError,
  onLogsPress,
  onProfilePress,
  onSelectedProfileChange,
  onThemeModeToggle,
}: MobileHeaderProps): React.JSX.Element {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileSelectVisible, setProfileSelectVisible] = useState(false);
  const { logout, profileCredentials, syncedProfileGroups, syncedProfiles, user } = useAuth();
  const ThemeIcon = theme.isDark ? Moon : Sun;
  const displayName = user?.name || user?.email || 'Kubdee AI User';
  const planLabel = formatPlanLabel(user?.plan);
  const expiryLabel = formatExpiryLabel(user?.expiryDate);
  const creditsLabel = typeof user?.credits === 'number'
    ? new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(user.credits)
    : '0';
  const devicesLabel = `${user?.activeDevices ?? 0}/${user?.maxDevices ?? 0}`;
  const groupByLocalId = useMemo(() => {
    return new Map(profileGroups.map((group) => [group.localId, group]));
  }, [profileGroups]);
  const selectedProfile = profiles.find((profile) => profile.localId === selectedProfileLocalId) ?? profiles[0] ?? null;
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

  const handleSelectProfile = (profileLocalId: string): void => {
    onSelectedProfileChange(profileLocalId);
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
                  const active = profile.localId === selectedProfileLocalId;
                  const group = profile.groupLocalId == null
                    ? null
                    : groupByLocalId.get(profile.groupLocalId) ?? null;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={profile.localId}
                      onPress={() => handleSelectProfile(profile.localId)}
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
                          {group?.name || 'ไม่มีกลุ่ม'} · {profile.localId}
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
              borderColor: profileMenuOpen ? theme.blue : theme.borderStrong,
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
                backgroundColor: theme.card,
                borderColor: theme.border,
                shadowColor: theme.shadow,
              },
            ]}
          >
            <View style={styles.profilePopoverHeader}>
              <View style={[styles.popoverAvatarFallback, { backgroundColor: theme.cyanSoft }]}>
                <UserCircle size={24} color={theme.cyan} strokeWidth={2.1} />
                {user?.image ? (
                  <Image resizeMode="cover" source={{ uri: user.image }} style={styles.popoverAvatarImage} />
                ) : null}
              </View>
              <View style={styles.profileNameBlock}>
                <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={[styles.profileEmail, { color: theme.textSubtle }]} numberOfLines={1}>
                  {user?.email || 'Google account'}
                </Text>
              </View>
            </View>

            <View style={styles.profileStatsGrid}>
              <PopoverStat
                icon={CreditCard}
                label="Plan"
                theme={theme}
                value={planLabel}
              />
              <PopoverStat
                icon={Coins}
                label="Credits"
                theme={theme}
                value={creditsLabel}
              />
              <PopoverStat
                icon={HardDrive}
                label="Devices"
                theme={theme}
                value={devicesLabel}
              />
            </View>

            <View style={[styles.expiryRow, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
              <Text style={[styles.expiryLabel, { color: theme.textSubtle }]}>หมดอายุ</Text>
              <Text style={[styles.expiryValue, { color: theme.text }]} numberOfLines={1}>
                {expiryLabel}
              </Text>
            </View>

            <View style={styles.profileMetaGrid}>
              <MetaChip label="Profiles" theme={theme} value={syncedProfiles.length} />
              <MetaChip label="Groups" theme={theme} value={syncedProfileGroups.length} />
              <MetaChip label="Accounts" theme={theme} value={profileCredentials.length} />
            </View>

            <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />

            <Pressable
              accessibilityRole="button"
              onPress={handleOpenProfile}
              style={({ pressed }) => [
                styles.menuAction,
                {
                  backgroundColor: theme.cardMuted,
                  borderColor: theme.border,
                  opacity: pressed ? 0.76 : 1,
                },
              ]}
            >
              <View style={styles.menuActionContent}>
                <View style={[styles.menuIconBox, { backgroundColor: theme.cyanSoft }]}>
                  <UserCircle size={15} color={theme.cyan} strokeWidth={2.2} />
                </View>
                <Text style={[styles.menuLabel, { color: theme.text }]} numberOfLines={1}>
                  โปรไฟล์และแผน
                </Text>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={handleOpenLogs}
              style={({ pressed }) => [
                styles.menuAction,
                {
                  backgroundColor: theme.cardMuted,
                  borderColor: theme.border,
                  opacity: pressed ? 0.76 : 1,
                },
              ]}
            >
              <View style={styles.menuActionContent}>
                <View style={[styles.menuIconBox, { backgroundColor: theme.panelMuted }]}>
                  <ChartNoAxesColumn size={15} color={theme.textSubtle} strokeWidth={2.2} />
                </View>
                <Text style={[styles.menuLabel, { color: theme.text }]} numberOfLines={1}>
                  Logs
                </Text>
              </View>
            </Pressable>

            <View style={[styles.themeRow, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
              <View style={styles.themeLabelWrap}>
                <View style={[styles.menuIconBox, { backgroundColor: theme.isDark ? theme.active : theme.amberSoft }]}>
                  <ThemeIcon size={15} color={theme.isDark ? theme.blue : theme.amber} strokeWidth={2.2} />
                </View>
                <Text style={[styles.menuLabel, { color: theme.text }]}>
                  {theme.isDark ? 'Dark mode' : 'Light mode'}
                </Text>
              </View>
              <Switch
                onValueChange={handleThemeToggle}
                thumbColor={theme.isDark ? theme.blue : theme.amber}
                trackColor={{ false: theme.borderStrong, true: alpha(theme.blue, 0.24) }}
                value={theme.isDark}
              />
            </View>

            <Pressable
              accessibilityRole="link"
              onPress={handleOpenWebsite}
              style={({ pressed }) => [
                styles.menuAction,
                {
                  backgroundColor: theme.cardMuted,
                  borderColor: theme.border,
                  opacity: pressed ? 0.76 : 1,
                },
              ]}
            >
              <View style={styles.menuActionContent}>
                <View style={[styles.menuIconBox, { backgroundColor: theme.emeraldSoft }]}>
                  <ExternalLink size={15} color={theme.emerald} strokeWidth={2.2} />
                </View>
                <Text style={[styles.menuLabel, { color: theme.text }]} numberOfLines={1}>
                  เปิดเว็บ Kubdee AI
                </Text>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={handleLogout}
              style={({ pressed }) => [
                styles.menuAction,
                {
                  backgroundColor: theme.redSoft,
                  borderColor: alpha(theme.red, 0.35),
                  opacity: pressed ? 0.76 : 1,
                },
              ]}
            >
              <View style={styles.menuActionContent}>
                <View style={[styles.menuIconBox, { backgroundColor: alpha(theme.red, theme.isDark ? 0.16 : 0.1) }]}>
                  <LogOut size={15} color={theme.red} strokeWidth={2.2} />
                </View>
                <Text style={[styles.menuLabel, { color: theme.red }]} numberOfLines={1}>
                  ออกจากระบบ
                </Text>
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

interface PopoverStatProps {
  icon: typeof CreditCard;
  label: string;
  value: string;
  theme: KubdeeTheme;
}

function PopoverStat({ icon: Icon, label, value, theme }: PopoverStatProps): React.JSX.Element {
  return (
    <View style={[styles.statBox, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
      <Icon size={13} color={theme.textSubtle} strokeWidth={2.1} />
      <Text style={[styles.statValue, { color: theme.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: theme.textSubtle }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function MetaChip({ label, value, theme }: { label: string; value: number; theme: KubdeeTheme }): React.JSX.Element {
  return (
    <View style={[styles.metaChip, { backgroundColor: theme.panelMuted }]}>
      <Text style={[styles.metaChipValue, { color: theme.text }]}>{value.toLocaleString('th-TH')}</Text>
      <Text style={[styles.metaChipLabel, { color: theme.textSubtle }]}>{label}</Text>
    </View>
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
  expiryLabel: {
    fontSize: typography.caption,
    fontWeight: '700',
  },
  expiryRow: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 36,
    paddingHorizontal: 10,
  },
  expiryValue: {
    flex: 1,
    fontSize: typography.caption,
    fontWeight: '900',
    textAlign: 'right',
  },
  menuAction: {
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 40,
    overflow: 'hidden',
  },
  menuActionContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 9,
  },
  menuDivider: {
    height: 1,
  },
  menuIconBox: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  menuLabel: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 16,
  },
  metaChip: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    minHeight: 38,
    paddingVertical: 6,
  },
  metaChipLabel: {
    fontSize: typography.tiny,
    fontWeight: '800',
    includeFontPadding: false,
    lineHeight: 12,
  },
  metaChipValue: {
    fontSize: typography.body,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 15,
  },
  popoverAvatarFallback: {
    alignItems: 'center',
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 42,
  },
  popoverAvatarImage: {
    borderRadius: 21,
    height: 42,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 42,
  },
  popoverBackdrop: {
    flex: 1,
  },
  profileEmail: {
    fontSize: typography.caption,
    fontWeight: '700',
    marginTop: 2,
  },
  profileMetaGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  profileName: {
    fontSize: typography.label,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 18,
  },
  profileNameBlock: {
    flex: 1,
    minWidth: 0,
  },
  profilePopover: {
    borderRadius: radii.lg,
    borderWidth: 1,
    elevation: 10,
    gap: spacing.sm,
    padding: 10,
    position: 'absolute',
    right: 12,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    top: 74,
    width: 306,
  },
  profilePopoverHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
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
    fontWeight: '700',
    includeFontPadding: false,
    lineHeight: 13,
  },
  profileSelectTitle: {
    fontSize: typography.caption,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 15,
  },
  profileStatsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statBox: {
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    minHeight: 62,
    padding: 8,
  },
  statLabel: {
    fontSize: typography.tiny,
    fontWeight: '800',
    marginTop: 2,
  },
  statValue: {
    fontSize: typography.body,
    fontWeight: '900',
    marginTop: 7,
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
    transform: [{ translateY: 2 }],
  },
  themeLabelWrap: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  themeRow: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 42,
    paddingLeft: 9,
    paddingRight: 8,
  },
});
