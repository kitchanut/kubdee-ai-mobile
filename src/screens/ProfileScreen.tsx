import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  Coins,
  CreditCard,
  FolderPlus,
  Globe2,
  HardDrive,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Users,
  UserCircle,
  X,
  Archive,
  RotateCcw,
  Trash2,
} from 'lucide-react-native';

import { useAuth } from '@/auth/AuthContext';
import { BACKEND_URL } from '@/auth/constants';
import { formatExpiryLabel, formatPlanLabel } from '@/auth/plan';
import type { SyncedProfile, SyncedProfileGroup } from '@/auth/types';
import Text from '@/components/ui/KubdeeText';
import SectionHeader from '@/components/ui/SectionHeader';
import StatusPill from '@/components/ui/StatusPill';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha, radii, spacing, typography } from '@/theme/tokens';

interface ProfileScreenProps {
  theme: KubdeeTheme;
}

interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
  color: string;
  backgroundColor: string;
  icon: typeof CreditCard;
  theme: KubdeeTheme;
}

interface InfoRowProps {
  label: string;
  value: string;
  icon: typeof CreditCard;
  theme: KubdeeTheme;
}

interface ActionRowProps {
  label: string;
  icon: typeof RefreshCw;
  iconColor: string;
  iconBackground: string;
  theme: KubdeeTheme;
  disabled?: boolean;
  role?: 'button' | 'link';
  danger?: boolean;
  loading?: boolean;
  onPress: () => void;
}

interface ProfileListRow {
  profile: SyncedProfile;
  group: SyncedProfileGroup | null;
  sourceLabel: string;
}

interface SyncedProfileRowProps {
  row: ProfileListRow;
  status: 'active' | 'deleted';
  theme: KubdeeTheme;
  disabled?: boolean;
  onConfirmDelete?: (profile: SyncedProfile) => void;
  onDelete?: (profile: SyncedProfile) => void;
  onRestore?: (profile: SyncedProfile) => void;
}

const GROUP_NONE = '__none__';
const GROUP_NEW = '__new__';

function formatCredits(credits?: number | null): string {
  if (typeof credits !== 'number') {
    return '0';
  }

  return new Intl.NumberFormat('th-TH', {
    maximumFractionDigits: 2,
  }).format(credits);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('th-TH').format(value);
}

function formatSyncLabel(timestamp: number | null): string {
  if (!timestamp) {
    return 'ยังไม่ซิงก์';
  }

  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

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

function formatDeletedLabel(profile: SyncedProfile): string {
  const deletedAt = Number(profile.deletedAt ?? 0);
  const source = getSourceLabel(profile.deletedByDeviceType || profile.createdByApp || profile.originApp);
  if (!Number.isFinite(deletedAt) || deletedAt <= 0) {
    return `ถูกลบจาก ${source}`;
  }

  const time = new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(deletedAt * 1000));

  return `ถูกลบจาก ${source} · ${time}`;
}

function MetricCard({
  label,
  value,
  subtext,
  color,
  backgroundColor,
  icon: Icon,
  theme,
}: MetricCardProps): React.JSX.Element {
  return (
    <View style={[styles.metricCard, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
      <View style={[styles.metricIcon, { backgroundColor }]}>
        <Icon size={14} color={color} strokeWidth={2.3} />
      </View>
      <Text style={[styles.metricValue, { color: theme.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.metricLabel, { color: theme.textSubtle }]} numberOfLines={1}>
        {label}
      </Text>
      {subtext ? (
        <Text style={[styles.metricSubtext, { color: theme.textSubtle }]} numberOfLines={1}>
          {subtext}
        </Text>
      ) : null}
    </View>
  );
}

function SyncedProfileRow({
  row,
  status,
  theme,
  disabled,
  onConfirmDelete,
  onDelete,
  onRestore,
}: SyncedProfileRowProps): React.JSX.Element {
  const isDeleted = status === 'deleted';
  const iconBackground = isDeleted ? theme.amberSoft : theme.cyanSoft;
  const iconColor = isDeleted ? theme.amber : theme.cyan;

  return (
    <View style={[styles.syncedProfileRow, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
      <View style={[styles.syncedProfileIcon, { backgroundColor: iconBackground }]}>
        {isDeleted ? (
          <Archive size={18} color={iconColor} strokeWidth={2.2} />
        ) : (
          <UserCircle size={18} color={iconColor} strokeWidth={2.2} />
        )}
      </View>
      <View style={styles.syncedProfileBody}>
        <Text style={[styles.syncedProfileName, { color: theme.text }]} numberOfLines={1}>
          {row.profile.name}
        </Text>
        <Text style={[styles.syncedProfileMeta, { color: theme.textSubtle }]} numberOfLines={1}>
          {isDeleted ? formatDeletedLabel(row.profile) : `${row.group?.name || 'ไม่มีกลุ่ม'} · ${formatShortId(row.profile.id)}`}
        </Text>
        <View style={styles.profileChipRow}>
          <View style={[styles.sourceChip, { backgroundColor: theme.panelMuted }]}>
            <Globe2 size={11} color={theme.textSubtle} strokeWidth={2.2} />
            <Text style={[styles.sourceChipText, { color: theme.textSubtle }]} numberOfLines={1}>
              สร้างจาก {row.sourceLabel}
            </Text>
          </View>
          {isDeleted ? (
            <View style={[styles.sourceChip, { backgroundColor: theme.amberSoft }]}>
              <Text style={[styles.sourceChipText, { color: theme.amber }]} numberOfLines={1}>
                รอยืนยัน
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {isDeleted ? (
        <View style={styles.profileRowActions}>
          <TouchableOpacity
            activeOpacity={0.78}
            disabled={disabled}
            onPress={() => onRestore?.(row.profile)}
            style={[
              styles.profileRowAction,
              { backgroundColor: theme.emeraldSoft, opacity: disabled ? 0.55 : 1 },
            ]}
          >
            <RotateCcw size={12} color={theme.emerald} strokeWidth={2.3} />
            <Text style={[styles.profileRowActionText, { color: theme.emerald }]}>กู้คืน</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.78}
            disabled={disabled}
            onPress={() => onConfirmDelete?.(row.profile)}
            style={[
              styles.profileRowAction,
              { backgroundColor: theme.panelMuted, opacity: disabled ? 0.55 : 1 },
            ]}
          >
            <X size={12} color={theme.textSubtle} strokeWidth={2.3} />
            <Text style={[styles.profileRowActionText, { color: theme.textSubtle }]}>ซ่อน</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          activeOpacity={0.78}
          disabled={disabled}
          onPress={() => onDelete?.(row.profile)}
          style={[
            styles.deleteProfileButton,
            { backgroundColor: theme.redSoft, opacity: disabled ? 0.55 : 1 },
          ]}
        >
          <Trash2 size={13} color={theme.red} strokeWidth={2.3} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function InfoRow({ label, value, icon: Icon, theme }: InfoRowProps): React.JSX.Element {
  return (
    <View style={[styles.infoRow, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
      <Icon size={14} color={theme.textSubtle} strokeWidth={2.2} />
      <Text style={[styles.infoLabel, { color: theme.textSubtle }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ActionRow({
  label,
  icon: Icon,
  iconColor,
  iconBackground,
  theme,
  disabled,
  role = 'button',
  danger,
  loading,
  onPress,
}: ActionRowProps): React.JSX.Element {
  const labelColor = danger ? theme.red : theme.text;
  const borderColor = danger ? alpha(theme.red, 0.3) : theme.border;
  const backgroundColor = danger ? theme.redSoft : theme.cardMuted;

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      accessibilityRole={role}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionRow,
        {
          backgroundColor,
          borderColor,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <View style={[styles.actionIconBox, { backgroundColor: iconBackground }]}>
        {loading ? (
          <ActivityIndicator color={iconColor} size="small" />
        ) : (
          <Icon size={16} color={iconColor} strokeWidth={2.2} />
        )}
      </View>
      <Text style={[styles.actionLabel, { color: labelColor }]} numberOfLines={1}>
        {label}
      </Text>
      <ChevronRight size={15} color={danger ? theme.red : theme.textSubtle} strokeWidth={2.2} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ theme }: ProfileScreenProps): React.JSX.Element {
  const {
    confirmDeletedProfileLocally,
    createProfileError,
    createSyncedProfile,
    deleteSyncedProfile,
    deletedSyncedProfiles,
    isCheckingPlan,
    isCreatingProfile,
    isSyncingProfiles,
    isUpdatingProfile,
    lastProfilesSyncedAt,
    lastSyncedAt,
    logout,
    profileDataError,
    profileSyncError,
    restoreDeletedSyncedProfile,
    syncProfile,
    syncedProfileGroups,
    syncedProfiles,
    user,
  } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>(GROUP_NONE);
  const [newGroupName, setNewGroupName] = useState('');
  const displayName = user?.name || user?.email || 'Kubdee AI User';
  const planLabel = formatPlanLabel(user?.plan);
  const expiryLabel = formatExpiryLabel(user?.expiryDate);
  const devicesLabel = `${user?.activeDevices ?? 0}/${user?.maxDevices ?? 0}`;
  const syncError = profileSyncError || profileDataError;
  const isSyncing = isCheckingPlan || isSyncingProfiles;
  const createDisabled =
    isCreatingProfile ||
    !profileName.trim() ||
    (selectedGroupId === GROUP_NEW && !newGroupName.trim());
  const syncStatusLabel = isSyncing ? 'SYNCING' : syncError ? 'ERROR' : 'SYNCED';
  const syncStatusColor = syncError ? theme.red : theme.emerald;
  const syncStatusBackground = syncError ? theme.redSoft : theme.emeraldSoft;
  const profileRows = useMemo<ProfileListRow[]>(() => {
    const groupById = new Map(syncedProfileGroups.map((group) => [group.id, group]));

    return syncedProfiles.map((profile) => ({
      profile,
      group: profile.groupId == null ? null : groupById.get(profile.groupId) ?? null,
      sourceLabel: getSourceLabel(profile.createdByApp || profile.originApp),
    }));
  }, [syncedProfileGroups, syncedProfiles]);
  const deletedProfileRows = useMemo<ProfileListRow[]>(() => {
    const groupById = new Map(syncedProfileGroups.map((group) => [group.id, group]));

    return deletedSyncedProfiles.map((profile) => ({
      profile,
      group: profile.groupId == null ? null : groupById.get(profile.groupId) ?? null,
      sourceLabel: getSourceLabel(profile.createdByApp || profile.originApp),
    }));
  }, [deletedSyncedProfiles, syncedProfileGroups]);
  useEffect(() => {
    void syncProfile();
  }, [syncProfile]);

  useEffect(() => {
    const validSelectedGroup =
      selectedGroupId === GROUP_NONE ||
      selectedGroupId === GROUP_NEW ||
      syncedProfileGroups.some((group) => group.id === selectedGroupId);

    if (!validSelectedGroup) {
      setSelectedGroupId(GROUP_NONE);
    }
  }, [selectedGroupId, syncedProfileGroups]);

  const handleCreateProfile = async (): Promise<void> => {
    if (createDisabled) {
      return;
    }

    const ok = await createSyncedProfile({
      name: profileName,
      groupId: selectedGroupId === GROUP_NONE || selectedGroupId === GROUP_NEW ? null : selectedGroupId,
      newGroupName: selectedGroupId === GROUP_NEW ? newGroupName : null,
      profileSortOrder: syncedProfiles.length + 1,
      groupSortOrder: syncedProfileGroups.length + 1,
    });

    if (ok) {
      setProfileName('');
      setSelectedGroupId(GROUP_NONE);
      setNewGroupName('');
      setCreateOpen(false);
    }
  };

  const handleDeleteProfile = (profile: SyncedProfile): void => {
    Alert.alert(
      'ลบโปรไฟล์นี้?',
      'โปรไฟล์จะถูก soft delete บน Cloud และอุปกรณ์อื่นจะเห็นเป็นรายการรอยืนยันลบหลังซิงก์',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: () => {
            void deleteSyncedProfile(profile);
          },
        },
      ]
    );
  };

  const handleRestoreProfile = (profile: SyncedProfile): void => {
    Alert.alert(
      'กู้คืนโปรไฟล์นี้?',
      'โปรไฟล์จะกลับมาใช้งานและซิงก์กลับไปทุกอุปกรณ์',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'กู้คืน',
          onPress: () => {
            void restoreDeletedSyncedProfile(profile);
          },
        },
      ]
    );
  };

  const handleConfirmDeletedProfile = (profile: SyncedProfile): void => {
    Alert.alert(
      'ซ่อนโปรไฟล์ที่ถูกลบ?',
      'รายการนี้จะถูกซ่อนจากมือถือเครื่องนี้เท่านั้น แต่ข้อมูลบน Cloud จะยังเป็น soft delete และยังดูได้จากเว็บ',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ซ่อน',
          onPress: () => {
            void confirmDeletedProfileLocally(profile);
          },
        },
      ]
    );
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <SectionHeader
        icon={UserCircle}
        theme={theme}
        title="โปรไฟล์"
        right={
          <StatusPill
            backgroundColor={syncStatusBackground}
            color={syncStatusColor}
            icon={syncError ? ShieldCheck : CheckCircle2}
            label={syncStatusLabel}
          />
        }
      />

      <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {user?.image ? (
          <Image source={{ uri: user.image }} style={styles.avatarImage} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.cyanSoft }]}>
            <UserCircle size={24} color={theme.cyan} />
          </View>
        )}
        <View style={styles.profileBody}>
          <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.profileMeta, { color: theme.textSubtle }]} numberOfLines={1}>
            {user?.email || 'Google account'}
          </Text>
          <View style={styles.syncLine}>
            <Globe2 size={11} color={theme.textSubtle} strokeWidth={2.2} />
            <Text style={[styles.syncText, { color: theme.textSubtle }]} numberOfLines={1}>
              kubdee.ai · ซิงก์โปรไฟล์ล่าสุด {formatSyncLabel(lastProfilesSyncedAt || lastSyncedAt)}
            </Text>
          </View>
        </View>
        <StatusPill backgroundColor={theme.blue} color={theme.white} icon={BadgeCheck} label="CLOUD" />
      </View>

      {profileSyncError ? (
        <View style={[styles.errorBox, { backgroundColor: theme.redSoft, borderColor: alpha(theme.red, 0.3) }]}>
          <Text style={[styles.errorText, { color: theme.red }]}>{profileSyncError}</Text>
        </View>
      ) : null}

      <View style={styles.metricsGrid}>
        <MetricCard
          backgroundColor={theme.blue}
          color={theme.white}
          icon={CreditCard}
          label="Plan"
          subtext={expiryLabel}
          theme={theme}
          value={planLabel}
        />
        <MetricCard
          backgroundColor={theme.amberSoft}
          color={theme.amber}
          icon={Coins}
          label="Credits"
          theme={theme}
          value={formatCredits(user?.credits)}
        />
        <MetricCard
          backgroundColor={theme.emeraldSoft}
          color={theme.emerald}
          icon={HardDrive}
          label="Devices"
          subtext="active/max"
          theme={theme}
          value={devicesLabel}
        />
      </View>

      <SectionHeader icon={ShieldCheck} theme={theme} title="บัญชีและแผน" />
      <View style={styles.infoGroup}>
        <InfoRow icon={CalendarDays} label="หมดอายุ" theme={theme} value={expiryLabel} />
        <InfoRow icon={ShieldCheck} label="สิทธิ์" theme={theme} value="Ultra plan สำหรับ Mobile" />
        <InfoRow icon={UserCircle} label="User ID" theme={theme} value={user?.id || '-'} />
      </View>

      <SectionHeader
        icon={Users}
        theme={theme}
        title="โปรไฟล์จากระบบซิงก์"
        right={
          <StatusPill
            backgroundColor={theme.cyanSoft}
            color={theme.cyan}
          icon={UserCircle}
          label={`${formatCount(syncedProfiles.length)} ใช้งาน`}
        />
        }
      />

      {profileDataError ? (
        <View style={[styles.errorBox, { backgroundColor: theme.redSoft, borderColor: alpha(theme.red, 0.3) }]}>
          <Text style={[styles.errorText, { color: theme.red }]}>{profileDataError}</Text>
        </View>
      ) : null}

      <View style={styles.metricsGrid}>
        <MetricCard
          backgroundColor={theme.cyanSoft}
          color={theme.cyan}
          icon={UserCircle}
          label="Profiles"
          theme={theme}
          value={formatCount(syncedProfiles.length)}
        />
        <MetricCard
          backgroundColor={theme.emeraldSoft}
          color={theme.emerald}
          icon={Users}
          label="Groups"
          theme={theme}
          value={formatCount(syncedProfileGroups.length)}
        />
        <MetricCard
          backgroundColor={theme.amberSoft}
          color={theme.amber}
          icon={Archive}
          label="Deleted"
          subtext="รอยืนยัน"
          theme={theme}
          value={formatCount(deletedSyncedProfiles.length)}
        />
      </View>

      <ActionRow
        icon={createOpen ? X : Plus}
        iconBackground={createOpen ? theme.panelMuted : theme.cyanSoft}
        iconColor={createOpen ? theme.textSubtle : theme.cyan}
        label={createOpen ? 'ปิดฟอร์มสร้างโปรไฟล์' : 'สร้างโปรไฟล์บน Mobile'}
        onPress={() => setCreateOpen((current) => !current)}
        theme={theme}
      />

      {createOpen ? (
        <View style={[styles.createPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.createPanelHead}>
            <View style={[styles.createPanelIcon, { backgroundColor: theme.cyanSoft }]}>
              <UserCircle size={16} color={theme.cyan} strokeWidth={2.2} />
            </View>
            <View style={styles.createPanelTitleWrap}>
              <Text style={[styles.createPanelTitle, { color: theme.text }]}>สร้างโปรไฟล์ใหม่</Text>
              <Text style={[styles.createPanelSubtitle, { color: theme.textSubtle }]} numberOfLines={1}>
                บันทึกขึ้น Cloud แล้วซิงก์กลับทุกอุปกรณ์
              </Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSubtle }]}>ชื่อโปรไฟล์</Text>
            <TextInput
              autoCapitalize="none"
              onChangeText={setProfileName}
              placeholder="เช่น Shopee ร้านหลัก"
              placeholderTextColor={theme.textSubtle}
              returnKeyType="done"
              style={[
                styles.input,
                { backgroundColor: theme.input, borderColor: theme.border, color: theme.text },
              ]}
              value={profileName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSubtle }]}>กลุ่ม</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.groupChipScroll}
            >
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={() => setSelectedGroupId(GROUP_NONE)}
                style={[
                  styles.groupChip,
                  {
                    backgroundColor: selectedGroupId === GROUP_NONE ? theme.cyanSoft : theme.cardMuted,
                    borderColor: selectedGroupId === GROUP_NONE ? alpha(theme.cyan, 0.45) : theme.border,
                  },
                ]}
              >
                <Text
                  style={[styles.groupChipText, { color: selectedGroupId === GROUP_NONE ? theme.cyan : theme.text }]}
                  numberOfLines={1}
                >
                  ไม่มีกลุ่ม
                </Text>
              </TouchableOpacity>
              {syncedProfileGroups.map((group) => {
                const selected = group.id === selectedGroupId;

                return (
                  <TouchableOpacity
                    activeOpacity={0.78}
                    key={group.id}
                    onPress={() => setSelectedGroupId(group.id)}
                    style={[
                      styles.groupChip,
                      {
                        backgroundColor: selected ? theme.cyanSoft : theme.cardMuted,
                        borderColor: selected ? alpha(theme.cyan, 0.45) : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.groupChipText, { color: selected ? theme.cyan : theme.text }]}
                      numberOfLines={1}
                    >
                      {group.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={() => setSelectedGroupId(GROUP_NEW)}
                style={[
                  styles.groupChip,
                  {
                    backgroundColor: selectedGroupId === GROUP_NEW ? theme.amberSoft : theme.cardMuted,
                    borderColor: selectedGroupId === GROUP_NEW ? alpha(theme.amber, 0.45) : theme.border,
                  },
                ]}
              >
                <FolderPlus
                  size={12}
                  color={selectedGroupId === GROUP_NEW ? theme.amber : theme.textSubtle}
                  strokeWidth={2.2}
                />
                <Text
                  style={[styles.groupChipText, { color: selectedGroupId === GROUP_NEW ? theme.amber : theme.text }]}
                  numberOfLines={1}
                >
                  กลุ่มใหม่
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {selectedGroupId === GROUP_NEW ? (
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSubtle }]}>ชื่อกลุ่มใหม่</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setNewGroupName}
                placeholder="เช่น TikTok"
                placeholderTextColor={theme.textSubtle}
                returnKeyType="done"
                style={[
                  styles.input,
                  { backgroundColor: theme.input, borderColor: theme.border, color: theme.text },
                ]}
                value={newGroupName}
              />
            </View>
          ) : null}

          {createProfileError ? (
            <View style={[styles.errorBox, { backgroundColor: theme.redSoft, borderColor: alpha(theme.red, 0.3) }]}>
              <Text style={[styles.errorText, { color: theme.red }]}>{createProfileError}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.78}
            disabled={createDisabled}
            onPress={handleCreateProfile}
            style={[
              styles.createButton,
              {
                backgroundColor: theme.cyan,
                opacity: createDisabled ? 0.55 : 1,
              },
            ]}
          >
            {isCreatingProfile ? (
              <ActivityIndicator color={theme.white} size="small" />
            ) : (
              <Save size={15} color={theme.white} strokeWidth={2.3} />
            )}
            <Text style={[styles.createButtonText, { color: theme.white }]}>
              {isCreatingProfile ? 'กำลังสร้างและซิงก์' : 'สร้างและซิงก์ขึ้น Cloud'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isSyncingProfiles && profileRows.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
          <ActivityIndicator color={theme.blue} size="small" />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>กำลังโหลดโปรไฟล์จากเว็บ</Text>
        </View>
      ) : profileRows.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.panelMuted }]}>
            <UserCircle size={20} color={theme.textSubtle} strokeWidth={2.2} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>ยังไม่มีโปรไฟล์ใช้งานอยู่</Text>
          <Text style={[styles.emptyDescription, { color: theme.textSubtle }]}>
            สร้างบน Mobile ได้ทันที หรือซิงก์จาก Desktop/Extension แล้ว Mobile จะเห็นที่นี่
          </Text>
          <TouchableOpacity
            activeOpacity={0.78}
            onPress={() => setCreateOpen(true)}
            style={[styles.emptyAction, { backgroundColor: theme.cyanSoft, borderColor: alpha(theme.cyan, 0.36) }]}
          >
            <Plus size={14} color={theme.cyan} strokeWidth={2.3} />
            <Text style={[styles.emptyActionText, { color: theme.cyan }]}>สร้างโปรไฟล์แรก</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.syncedProfileList}>
          {profileRows.map((row) => (
            <SyncedProfileRow
              key={row.profile.id}
              disabled={isUpdatingProfile}
              row={row}
              status="active"
              theme={theme}
              onDelete={handleDeleteProfile}
            />
          ))}
        </View>
      )}

      {deletedProfileRows.length > 0 ? (
        <>
          <SectionHeader
            icon={Archive}
            theme={theme}
            title="โปรไฟล์ที่ถูกลบ"
            right={
              <StatusPill
                backgroundColor={theme.amberSoft}
                color={theme.amber}
                icon={Archive}
                label={`${formatCount(deletedProfileRows.length)} รอยืนยัน`}
              />
            }
          />
          <View style={styles.syncedProfileList}>
            {deletedProfileRows.map((row) => (
              <SyncedProfileRow
                key={row.profile.id}
                disabled={isUpdatingProfile}
                row={row}
                status="deleted"
                theme={theme}
                onConfirmDelete={handleConfirmDeletedProfile}
                onRestore={handleRestoreProfile}
              />
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.actionList}>
        <ActionRow
          disabled={isSyncing}
          icon={RefreshCw}
          iconBackground={theme.blue}
          iconColor={theme.white}
          label="ซิงก์โปรไฟล์จาก Cloud"
          loading={isSyncing}
          onPress={syncProfile}
          theme={theme}
        />
        <ActionRow
          icon={Globe2}
          iconBackground={theme.emeraldSoft}
          iconColor={theme.emerald}
          label="เปิดเว็บ Kubdee AI"
          onPress={() => Linking.openURL(BACKEND_URL)}
          role="link"
          theme={theme}
        />
        <ActionRow
          danger
          icon={LogOut}
          iconBackground={theme.redSoft}
          iconColor={theme.red}
          label="ออกจากระบบ"
          onPress={logout}
          theme={theme}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actionIconBox: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  actionLabel: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '800',
    includeFontPadding: false,
    lineHeight: 16,
  },
  actionList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionRow: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: radii.lg,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarImage: {
    borderRadius: radii.lg,
    height: 42,
    width: 42,
  },
  content: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  createButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  createButtonText: {
    fontSize: typography.body,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 16,
  },
  createPanel: {
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: 12,
  },
  createPanelHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  createPanelIcon: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  createPanelSubtitle: {
    fontSize: typography.caption,
    fontWeight: '700',
    marginTop: 2,
  },
  createPanelTitle: {
    fontSize: typography.body,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 17,
  },
  createPanelTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  emptyAction: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.xs,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  emptyActionText: {
    fontSize: typography.body,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 16,
  },
  errorBox: {
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: typography.body,
    fontWeight: '700',
    lineHeight: 17,
  },
  emptyDescription: {
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  emptyState: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyTitle: {
    fontSize: typography.body,
    fontWeight: '900',
    lineHeight: 17,
    textAlign: 'center',
  },
  infoGroup: {
    gap: spacing.sm,
  },
  infoLabel: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '700',
  },
  infoRow: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 10,
  },
  infoValue: {
    flex: 1.35,
    fontSize: typography.body,
    fontWeight: '800',
    textAlign: 'right',
  },
  groupChip: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    height: 34,
    maxWidth: 150,
    paddingHorizontal: 10,
  },
  groupChipScroll: {
    gap: 6,
    paddingRight: 4,
  },
  groupChipText: {
    flexShrink: 1,
    fontSize: typography.caption,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 14,
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    fontFamily: kubdeeFontFamilies.thai.regular,
    fontSize: typography.body,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputGroup: {
    gap: 5,
  },
  inputLabel: {
    fontSize: typography.micro,
    fontWeight: '800',
  },
  metricCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    minHeight: 88,
    padding: 10,
  },
  metricIcon: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 26,
    justifyContent: 'center',
    marginBottom: 8,
    width: 26,
  },
  metricLabel: {
    fontSize: typography.caption,
    fontWeight: '800',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricSubtext: {
    fontSize: typography.tiny,
    fontWeight: '700',
    marginTop: 2,
  },
  metricValue: {
    fontSize: typography.label,
    fontWeight: '900',
    marginBottom: 2,
  },
  profileBody: {
    flex: 1,
    minWidth: 0,
  },
  profileCard: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  profileMeta: {
    fontSize: typography.caption,
    marginTop: 2,
  },
  profileName: {
    fontSize: typography.label,
    fontWeight: '900',
  },
  deleteProfileButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  profileChipRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  profileRowAction: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 7,
  },
  profileRowActions: {
    alignItems: 'flex-end',
    gap: 5,
  },
  profileRowActionText: {
    fontSize: typography.tiny,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 12,
  },
  syncLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 5,
  },
  syncText: {
    fontSize: typography.caption,
    fontWeight: '700',
  },
  sourceChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: 4,
    marginTop: 5,
    maxWidth: '100%',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceChipText: {
    flexShrink: 1,
    fontSize: typography.tiny,
    fontWeight: '800',
    includeFontPadding: false,
    lineHeight: 12,
  },
  syncedProfileBody: {
    flex: 1,
    minWidth: 0,
  },
  syncedProfileIcon: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  syncedProfileList: {
    gap: spacing.sm,
  },
  syncedProfileMeta: {
    fontSize: typography.caption,
    fontWeight: '700',
    marginTop: 1,
  },
  syncedProfileName: {
    fontSize: typography.body,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 17,
  },
  syncedProfileRow: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 58,
    padding: 9,
  },
});
