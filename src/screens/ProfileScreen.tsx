import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Archive,
  Check,
  Cloud,
  CloudCheck,
  CloudOff,
  FolderPlus,
  Globe2,
  LogOut,
  Plus,
  RotateCcw,
  Trash2,
  User,
  UserCircle,
  Users,
  X,
} from 'lucide-react-native';

import { useAuth } from '@/auth/AuthContext';
import { BACKEND_URL } from '@/auth/constants';
import { formatExpiryLabel, formatPlanLabel } from '@/auth/plan';
import type { SyncedProfile, SyncedProfileGroup } from '@/auth/types';
import Text from '@/components/ui/KubdeeText';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';

interface ProfileScreenProps {
  theme: KubdeeTheme;
  selectedProfileId?: string;
  onSelectProfile?: (profileId: string) => void;
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

function getDeletedSourceLabel(profile: SyncedProfile): string {
  return getSourceLabel(profile.deletedByDeviceType || profile.createdByApp || profile.originApp);
}

/** Extension ProfileRow: bordered row, 28px icon square (inverse when active), name + meta, trash strip */
function ProfileRow({
  theme,
  profile,
  group,
  active,
  disabled,
  onSelect,
  onDelete,
}: {
  theme: KubdeeTheme;
  profile: SyncedProfile;
  group: SyncedProfileGroup | null;
  active: boolean;
  disabled?: boolean;
  onSelect?: (profileId: string) => void;
  onDelete?: (profile: SyncedProfile) => void;
}): React.JSX.Element {
  const inverseBackground = theme.isDark ? theme.white : '#111827';
  const inverseText = theme.isDark ? '#111827' : theme.white;

  return (
    <View
      style={[
        styles.profileRow,
        {
          backgroundColor: active
            ? theme.isDark
              ? theme.cardMuted
              : theme.panelMuted
            : theme.panel,
          borderColor: active ? theme.borderStrong : theme.border,
        },
      ]}
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        activeOpacity={0.78}
        disabled={disabled}
        onPress={() => onSelect?.(profile.id)}
        style={[styles.profileRowMain, { opacity: disabled ? 0.6 : 1 }]}
      >
        <View
          style={[
            styles.profileRowIcon,
            {
              backgroundColor: active
                ? inverseBackground
                : theme.isDark
                  ? theme.cardMuted
                  : theme.panelMuted,
            },
          ]}
        >
          <User
            size={14}
            color={active ? inverseText : theme.textSubtle}
            strokeWidth={2.2}
          />
        </View>
        <View style={styles.profileRowInfo}>
          <Text numberOfLines={1} style={[styles.profileRowName, { color: theme.text }]}>
            {profile.name}
          </Text>
          <Text numberOfLines={1} style={[styles.profileRowMeta, { color: theme.textSubtle }]}>
            {group?.name || 'ไม่มีกลุ่ม'} · {getSourceLabel(profile.createdByApp || profile.originApp)} ·{' '}
            {formatShortId(profile.id)}
          </Text>
        </View>
      </TouchableOpacity>

      {onDelete ? (
        <TouchableOpacity
          accessibilityLabel="ลบโปรไฟล์"
          accessibilityRole="button"
          activeOpacity={0.7}
          disabled={disabled}
          onPress={() => onDelete(profile)}
          style={[styles.profileRowDelete, { opacity: disabled ? 0.5 : 1 }]}
        >
          <Trash2 size={14} color={theme.red} strokeWidth={2} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Extension DeletedProfileRow: amber card + กู้คืน / ซ่อน buttons */
function DeletedProfileRow({
  theme,
  profile,
  group,
  disabled,
  onRestore,
  onConfirmDelete,
}: {
  theme: KubdeeTheme;
  profile: SyncedProfile;
  group: SyncedProfileGroup | null;
  disabled?: boolean;
  onRestore?: (profile: SyncedProfile) => void;
  onConfirmDelete?: (profile: SyncedProfile) => void;
}): React.JSX.Element {
  return (
    <View
      style={[
        styles.deletedRow,
        {
          backgroundColor: alpha(theme.amber, theme.isDark ? 0.1 : 0.08),
          borderColor: alpha(theme.amber, theme.isDark ? 0.4 : 0.35),
        },
      ]}
    >
      <View style={styles.deletedRowHead}>
        <View style={[styles.deletedRowIcon, { backgroundColor: alpha(theme.amber, theme.isDark ? 0.2 : 0.16) }]}>
          <Archive size={14} color={theme.amber} strokeWidth={2.2} />
        </View>
        <View style={styles.deletedRowInfo}>
          <View style={styles.deletedRowTitleRow}>
            <Text numberOfLines={1} style={[styles.deletedRowName, { color: theme.text }]}>
              {profile.name}
            </Text>
            <Text numberOfLines={1} style={[styles.deletedRowSource, { color: theme.amber }]}>
              ถูกลบจาก {getDeletedSourceLabel(profile)}
            </Text>
          </View>
          <Text numberOfLines={1} style={[styles.deletedRowMeta, { color: alpha(theme.amber, 0.85) }]}>
            {group?.name || 'ไม่มีกลุ่ม'} · {formatShortId(profile.id)}
          </Text>
        </View>
      </View>

      <View style={styles.deletedRowActions}>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.78}
          disabled={disabled}
          onPress={() => onRestore?.(profile)}
          style={[
            styles.deletedRowButton,
            {
              backgroundColor: alpha(theme.emerald, theme.isDark ? 0.16 : 0.1),
              borderColor: alpha(theme.emerald, 0.4),
              opacity: disabled ? 0.5 : 1,
            },
          ]}
        >
          <RotateCcw size={12} color={theme.emerald} strokeWidth={2.3} />
          <Text style={[styles.deletedRowButtonText, { color: theme.emerald }]}>กู้คืน</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.78}
          disabled={disabled}
          onPress={() => onConfirmDelete?.(profile)}
          style={[
            styles.deletedRowButton,
            {
              backgroundColor: alpha(theme.red, theme.isDark ? 0.16 : 0.08),
              borderColor: alpha(theme.red, 0.4),
              opacity: disabled ? 0.5 : 1,
            },
          ]}
        >
          <Check size={12} color={theme.red} strokeWidth={2.3} />
          <Text style={[styles.deletedRowButtonText, { color: theme.red }]}>ซ่อน</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ProfileScreen({
  theme,
  selectedProfileId = '',
  onSelectProfile,
}: ProfileScreenProps): React.JSX.Element {
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

  const groupById = useMemo(
    () => new Map(syncedProfileGroups.map((group) => [group.id, group])),
    [syncedProfileGroups]
  );
  const selectedProfile = useMemo(
    () => syncedProfiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [selectedProfileId, syncedProfiles]
  );
  const selectedGroup = selectedProfile?.groupId
    ? groupById.get(selectedProfile.groupId) ?? null
    : null;

  // Extension sync button: blue spinner / emerald CloudCheck / red CloudOff / neutral Cloud
  const syncStatus = isSyncing ? 'syncing' : syncError ? 'error' : lastProfilesSyncedAt || lastSyncedAt ? 'success' : 'idle';
  const SyncIcon = syncStatus === 'success' ? CloudCheck : syncStatus === 'error' ? CloudOff : Cloud;
  const syncToneColor =
    syncStatus === 'syncing'
      ? theme.blue
      : syncStatus === 'success'
        ? theme.emerald
        : syncStatus === 'error'
          ? theme.red
          : theme.textMuted;
  const syncToneBackground =
    syncStatus === 'idle' ? theme.panel : alpha(syncToneColor, theme.isDark ? 0.16 : 0.09);
  const syncToneBorder = syncStatus === 'idle' ? theme.border : alpha(syncToneColor, 0.4);

  const inverseBackground = theme.isDark ? theme.white : '#111827';
  const inverseText = theme.isDark ? '#111827' : theme.white;
  const cellBackground = theme.isDark ? theme.panelMuted : theme.cardMuted;

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

  const closeCreateModal = (): void => {
    if (isCreatingProfile) {
      return;
    }

    setProfileName('');
    setSelectedGroupId(GROUP_NONE);
    setNewGroupName('');
    setCreateOpen(false);
  };

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
    <>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Extension: โปรไฟล์ header — Users icon + sync button + เพิ่ม */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Users size={14} color={theme.text} strokeWidth={2.4} />
            <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.textMuted }]}>
              โปรไฟล์
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              accessibilityLabel="ซิงก์โปรไฟล์กับ Cloud"
              accessibilityRole="button"
              activeOpacity={0.78}
              disabled={isSyncing}
              onPress={() => {
                void syncProfile();
              }}
              style={[
                styles.syncButton,
                { backgroundColor: syncToneBackground, borderColor: syncToneBorder },
              ]}
            >
              {isSyncing ? (
                <ActivityIndicator color={syncToneColor} size="small" />
              ) : (
                <SyncIcon size={14} color={syncToneColor} strokeWidth={2.2} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.82}
              onPress={() => setCreateOpen(true)}
              style={[styles.addButton, { backgroundColor: inverseBackground }]}
            >
              <Plus size={12} color={inverseText} strokeWidth={2.5} />
              <Text style={[styles.addButtonText, { color: inverseText }]}>เพิ่ม</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Extension: sync stats card */}
        <View style={[styles.statsCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={styles.statsHeadRow}>
            <Text style={[styles.statsHeadLabel, { color: theme.textSubtle }]}>ซิงก์ล่าสุด</Text>
            <Text style={[styles.statsHeadValue, { color: theme.textMuted }]}>
              {formatSyncLabel(lastProfilesSyncedAt || lastSyncedAt)}
            </Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={[styles.statsCell, { backgroundColor: cellBackground }]}>
              <Text style={[styles.statsCellLabel, { color: theme.textSubtle }]}>ใช้งานอยู่</Text>
              <Text style={[styles.statsCellValue, { color: theme.text }]}>
                {formatCount(syncedProfiles.length)}
              </Text>
            </View>
            <View style={[styles.statsCell, { backgroundColor: cellBackground }]}>
              <Text style={[styles.statsCellLabel, { color: theme.textSubtle }]}>กลุ่ม</Text>
              <Text style={[styles.statsCellValue, { color: theme.text }]}>
                {formatCount(syncedProfileGroups.length)}
              </Text>
            </View>
            <View style={[styles.statsCell, { backgroundColor: cellBackground }]}>
              <Text style={[styles.statsCellLabel, { color: theme.textSubtle }]}>ถูกลบ</Text>
              <Text style={[styles.statsCellValue, { color: theme.text }]}>
                {formatCount(deletedSyncedProfiles.length)}
              </Text>
            </View>
          </View>

          {selectedProfile ? (
            <View
              style={[
                styles.activeBox,
                {
                  backgroundColor: theme.isDark ? theme.cardMuted : theme.panelMuted,
                  borderColor: theme.borderStrong,
                },
              ]}
            >
              <View style={styles.activeBoxRow}>
                <Text style={[styles.activeBoxBadge, { color: theme.textMuted }]}>ใช้งาน</Text>
                <Text numberOfLines={1} style={[styles.activeBoxName, { color: theme.text }]}>
                  {selectedProfile.name}
                </Text>
              </View>
              <Text numberOfLines={1} style={[styles.activeBoxMeta, { color: theme.textSubtle }]}>
                {selectedGroup?.name || 'ไม่มีกลุ่ม'} ·{' '}
                {getSourceLabel(selectedProfile.createdByApp || selectedProfile.originApp)} ·{' '}
                {formatShortId(selectedProfile.id)}
              </Text>
            </View>
          ) : null}

          {syncError ? (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: alpha(theme.red, theme.isDark ? 0.12 : 0.07), borderColor: alpha(theme.red, 0.35) },
              ]}
            >
              <Text style={[styles.errorText, { color: theme.red }]}>{syncError}</Text>
            </View>
          ) : null}
        </View>

        {/* Extension: โปรไฟล์ทั้งหมด */}
        <View style={styles.sectionHeadRow}>
          <View style={styles.headerLeft}>
            <User size={14} color={theme.text} strokeWidth={2.4} />
            <Text style={[styles.headerTitle, { color: theme.textMuted }]}>โปรไฟล์ทั้งหมด</Text>
          </View>
          <Text style={[styles.sectionHeadCount, { color: theme.textSubtle }]}>
            {formatCount(syncedProfiles.length)} รายการ
          </Text>
        </View>

        {isSyncingProfiles && syncedProfiles.length === 0 ? (
          <View
            style={[
              styles.emptyState,
              { backgroundColor: cellBackground, borderColor: theme.border },
            ]}
          >
            <ActivityIndicator color={theme.blue} size="small" />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>กำลังโหลดโปรไฟล์จาก Cloud</Text>
          </View>
        ) : syncedProfiles.length === 0 ? (
          <View
            style={[
              styles.emptyState,
              { backgroundColor: cellBackground, borderColor: theme.border },
            ]}
          >
            <User size={20} color={theme.textSubtle} strokeWidth={2} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>ยังไม่มีโปรไฟล์ใช้งานอยู่</Text>
            <Text style={[styles.emptyDescription, { color: theme.textSubtle }]}>
              สร้างโปรไฟล์แรกบนมือถือ แล้วระบบจะซิงก์ขึ้น Cloud
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.82}
              onPress={() => setCreateOpen(true)}
              style={[styles.emptyAction, { backgroundColor: inverseBackground }]}
            >
              <Text style={[styles.emptyActionText, { color: inverseText }]}>สร้างโปรไฟล์แรก</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.profileList}>
            {syncedProfiles.map((profile) => (
              <ProfileRow
                key={profile.id}
                active={profile.id === selectedProfileId}
                disabled={isUpdatingProfile}
                group={profile.groupId == null ? null : groupById.get(profile.groupId) ?? null}
                profile={profile}
                theme={theme}
                onDelete={handleDeleteProfile}
                onSelect={onSelectProfile}
              />
            ))}
          </View>
        )}

        {/* Extension: โปรไฟล์ที่ถูกลบ */}
        {deletedSyncedProfiles.length > 0 ? (
          <>
            <View style={styles.sectionHeadRow}>
              <View style={styles.headerLeft}>
                <Archive size={14} color={theme.amber} strokeWidth={2.4} />
                <Text style={[styles.headerTitle, { color: theme.amber }]}>โปรไฟล์ที่ถูกลบ</Text>
              </View>
              <Text style={[styles.sectionHeadCount, { color: theme.amber }]}>
                {formatCount(deletedSyncedProfiles.length)} รอจัดการ
              </Text>
            </View>
            <View style={styles.profileList}>
              {deletedSyncedProfiles.map((profile) => (
                <DeletedProfileRow
                  key={profile.id}
                  disabled={isUpdatingProfile}
                  group={profile.groupId == null ? null : groupById.get(profile.groupId) ?? null}
                  profile={profile}
                  theme={theme}
                  onConfirmDelete={handleConfirmDeletedProfile}
                  onRestore={handleRestoreProfile}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* บัญชี */}
        <View style={styles.sectionHeadRow}>
          <View style={styles.headerLeft}>
            <UserCircle size={14} color={theme.text} strokeWidth={2.4} />
            <Text style={[styles.headerTitle, { color: theme.textMuted }]}>บัญชี</Text>
          </View>
        </View>

        <View style={[styles.accountCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={styles.accountHead}>
            {user?.image ? (
              <Image source={{ uri: user.image }} style={styles.accountAvatarImage} />
            ) : (
              <View style={[styles.accountAvatar, { backgroundColor: cellBackground }]}>
                <UserCircle size={20} color={theme.textSubtle} strokeWidth={2} />
              </View>
            )}
            <View style={styles.accountInfo}>
              <Text numberOfLines={1} style={[styles.accountName, { color: theme.text }]}>
                {displayName}
              </Text>
              <Text numberOfLines={1} style={[styles.accountEmail, { color: theme.textSubtle }]}>
                {user?.email || 'Google account'}
              </Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={[styles.statsCell, { backgroundColor: cellBackground }]}>
              <Text style={[styles.statsCellLabel, { color: theme.textSubtle }]}>แผน</Text>
              <Text numberOfLines={1} style={[styles.statsCellValue, { color: theme.text }]}>
                {planLabel}
              </Text>
              <Text numberOfLines={1} style={[styles.statsCellHint, { color: theme.textSubtle }]}>
                {expiryLabel}
              </Text>
            </View>
            <View style={[styles.statsCell, { backgroundColor: cellBackground }]}>
              <Text style={[styles.statsCellLabel, { color: theme.textSubtle }]}>เครดิต</Text>
              <Text numberOfLines={1} style={[styles.statsCellValue, { color: theme.text }]}>
                {formatCredits(user?.credits)}
              </Text>
            </View>
            <View style={[styles.statsCell, { backgroundColor: cellBackground }]}>
              <Text style={[styles.statsCellLabel, { color: theme.textSubtle }]}>อุปกรณ์</Text>
              <Text numberOfLines={1} style={[styles.statsCellValue, { color: theme.text }]}>
                {devicesLabel}
              </Text>
              <Text numberOfLines={1} style={[styles.statsCellHint, { color: theme.textSubtle }]}>
                active/max
              </Text>
            </View>
          </View>

          <View style={styles.accountActions}>
            <TouchableOpacity
              accessibilityRole="link"
              activeOpacity={0.78}
              onPress={() => Linking.openURL(BACKEND_URL)}
              style={[styles.accountButton, { backgroundColor: theme.panel, borderColor: theme.border }]}
            >
              <Globe2 size={13} color={theme.textMuted} strokeWidth={2.2} />
              <Text style={[styles.accountButtonText, { color: theme.textMuted }]}>เปิดเว็บ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.78}
              onPress={logout}
              style={[
                styles.accountButton,
                {
                  backgroundColor: alpha(theme.red, theme.isDark ? 0.12 : 0.06),
                  borderColor: alpha(theme.red, 0.35),
                },
              ]}
            >
              <LogOut size={13} color={theme.red} strokeWidth={2.2} />
              <Text style={[styles.accountButtonText, { color: theme.red }]}>ออกจากระบบ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Extension: create profile modal overlay */}
      <Modal animationType="fade" transparent visible={createOpen} onRequestClose={closeCreateModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
            <View style={[styles.modalHead, { borderBottomColor: theme.border }]}>
              <View style={styles.modalHeadLeft}>
                <View style={[styles.modalHeadIcon, { backgroundColor: cellBackground }]}>
                  <User size={14} color={theme.textMuted} strokeWidth={2.2} />
                </View>
                <View style={styles.modalHeadTitleWrap}>
                  <Text numberOfLines={1} style={[styles.modalTitle, { color: theme.text }]}>
                    สร้างโปรไฟล์ใหม่
                  </Text>
                  <Text numberOfLines={1} style={[styles.modalSubtitle, { color: theme.textSubtle }]}>
                    ซิงก์ขึ้น Cloud หลังสร้าง
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                accessibilityLabel="ปิด"
                accessibilityRole="button"
                activeOpacity={0.7}
                disabled={isCreatingProfile}
                onPress={closeCreateModal}
                style={styles.modalClose}
              >
                <X size={14} color={theme.textSubtle} strokeWidth={2.4} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSubtle }]}>ชื่อโปรไฟล์</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setProfileName}
                  placeholder="เช่น ร้านหลัก"
                  placeholderTextColor={theme.textSubtle}
                  returnKeyType="done"
                  style={[
                    styles.input,
                    {
                      backgroundColor: cellBackground,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  value={profileName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSubtle }]}>กลุ่ม</Text>
                <View style={styles.groupChipWrap}>
                  <TouchableOpacity
                    activeOpacity={0.78}
                    onPress={() => setSelectedGroupId(GROUP_NONE)}
                    style={[
                      styles.groupChip,
                      {
                        backgroundColor:
                          selectedGroupId === GROUP_NONE
                            ? theme.isDark
                              ? theme.cardMuted
                              : theme.panelMuted
                            : cellBackground,
                        borderColor: selectedGroupId === GROUP_NONE ? theme.borderStrong : theme.border,
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.groupChipText,
                        { color: selectedGroupId === GROUP_NONE ? theme.text : theme.textSubtle },
                      ]}
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
                            backgroundColor: selected
                              ? theme.isDark
                                ? theme.cardMuted
                                : theme.panelMuted
                              : cellBackground,
                            borderColor: selected ? theme.borderStrong : theme.border,
                          },
                        ]}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.groupChipText,
                            { color: selected ? theme.text : theme.textSubtle },
                          ]}
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
                        backgroundColor:
                          selectedGroupId === GROUP_NEW
                            ? theme.isDark
                              ? theme.cardMuted
                              : theme.panelMuted
                            : cellBackground,
                        borderColor: selectedGroupId === GROUP_NEW ? theme.borderStrong : theme.border,
                      },
                    ]}
                  >
                    <FolderPlus
                      size={12}
                      color={selectedGroupId === GROUP_NEW ? theme.text : theme.textSubtle}
                      strokeWidth={2.2}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.groupChipText,
                        { color: selectedGroupId === GROUP_NEW ? theme.text : theme.textSubtle },
                      ]}
                    >
                      สร้างกลุ่มใหม่
                    </Text>
                  </TouchableOpacity>
                </View>
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
                      {
                        backgroundColor: cellBackground,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                    ]}
                    value={newGroupName}
                  />
                </View>
              ) : null}

              {createProfileError ? (
                <View
                  style={[
                    styles.errorBox,
                    {
                      backgroundColor: alpha(theme.red, theme.isDark ? 0.12 : 0.07),
                      borderColor: alpha(theme.red, 0.35),
                    },
                  ]}
                >
                  <Text style={[styles.errorText, { color: theme.red }]}>{createProfileError}</Text>
                </View>
              ) : null}

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.78}
                  disabled={isCreatingProfile}
                  onPress={closeCreateModal}
                  style={[
                    styles.modalButton,
                    {
                      backgroundColor: theme.panel,
                      borderColor: theme.border,
                      opacity: isCreatingProfile ? 0.5 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.modalButtonText, { color: theme.textMuted }]}>ยกเลิก</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.82}
                  disabled={createDisabled}
                  onPress={() => {
                    void handleCreateProfile();
                  }}
                  style={[
                    styles.modalButton,
                    {
                      backgroundColor: inverseBackground,
                      borderColor: 'transparent',
                      opacity: createDisabled ? 0.5 : 1,
                    },
                  ]}
                >
                  {isCreatingProfile ? (
                    <ActivityIndicator color={inverseText} size="small" />
                  ) : null}
                  <Text style={[styles.modalButtonText, { color: inverseText }]}>
                    {isCreatingProfile ? 'กำลังสร้าง' : 'สร้างโปรไฟล์'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  accountActions: {
    flexDirection: 'row',
    gap: 8,
  },
  accountAvatar: {
    alignItems: 'center',
    borderRadius: 10,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  accountAvatarImage: {
    borderRadius: 10,
    height: 38,
    width: 38,
  },
  accountButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 34,
    justifyContent: 'center',
  },
  accountButtonText: {
    fontSize: 11,
    fontWeight: '600',
    includeFontPadding: false,
  },
  accountCard: {
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 8,
  },
  accountEmail: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  accountHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  accountInfo: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
  },
  activeBox: {
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  activeBoxBadge: {
    flexShrink: 0,
    fontSize: 9,
    fontWeight: '600',
  },
  activeBoxMeta: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  activeBoxName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
    minWidth: 0,
  },
  activeBoxRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  addButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    height: 28,
    paddingHorizontal: 10,
  },
  addButtonText: {
    fontSize: 11,
    fontWeight: '600',
    includeFontPadding: false,
  },
  content: {
    gap: 12,
    paddingBottom: 80,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  deletedRow: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
  },
  deletedRowActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  deletedRowButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 28,
    justifyContent: 'center',
  },
  deletedRowButtonText: {
    fontSize: 10,
    fontWeight: '600',
    includeFontPadding: false,
  },
  deletedRowHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  deletedRowIcon: {
    alignItems: 'center',
    borderRadius: 8,
    flexShrink: 0,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  deletedRowInfo: {
    flex: 1,
    minWidth: 0,
  },
  deletedRowMeta: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  deletedRowName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
    minWidth: 0,
  },
  deletedRowSource: {
    flexShrink: 0,
    fontSize: 9,
    fontWeight: '600',
  },
  deletedRowTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  emptyAction: {
    alignItems: 'center',
    borderRadius: 8,
    height: 28,
    justifyContent: 'center',
    marginTop: 4,
    paddingHorizontal: 12,
  },
  emptyActionText: {
    fontSize: 10,
    fontWeight: '600',
    includeFontPadding: false,
  },
  emptyDescription: {
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 15,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    borderRadius: 10,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorBox: {
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  groupChip: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    height: 30,
    maxWidth: 150,
    paddingHorizontal: 10,
  },
  groupChipText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '600',
    includeFontPadding: false,
  },
  groupChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
  },
  headerLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '600',
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    fontFamily: kubdeeFontFamilies.thai.regular,
    fontSize: 12,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputGroup: {
    gap: 5,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  modalBody: {
    gap: 12,
    padding: 12,
  },
  modalButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 34,
    justifyContent: 'center',
  },
  modalButtonText: {
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
  },
  modalCard: {
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: 360,
    width: '100%',
  },
  modalClose: {
    alignItems: 'center',
    borderRadius: 8,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 2,
  },
  modalHead: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalHeadIcon: {
    alignItems: 'center',
    borderRadius: 8,
    flexShrink: 0,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  modalHeadLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  modalHeadTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  modalTitle: {
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
  },
  profileList: {
    gap: 8,
  },
  profileRow: {
    alignItems: 'stretch',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  profileRowDelete: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
  },
  profileRowIcon: {
    alignItems: 'center',
    borderRadius: 8,
    flexShrink: 0,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  profileRowInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileRowMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  profileRowMeta: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  profileRowName: {
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
  },
  sectionHeadCount: {
    flexShrink: 0,
    fontSize: 10,
    fontWeight: '500',
  },
  sectionHeadRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 4,
  },
  statsCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
  },
  statsCell: {
    borderRadius: 6,
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statsCellHint: {
    fontSize: 8,
    fontWeight: '500',
    marginTop: 1,
  },
  statsCellLabel: {
    fontSize: 8,
    fontWeight: '500',
  },
  statsCellValue: {
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
    marginTop: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 4,
  },
  statsHeadLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  statsHeadRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statsHeadValue: {
    fontSize: 11,
    fontWeight: '600',
  },
  syncButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
});
