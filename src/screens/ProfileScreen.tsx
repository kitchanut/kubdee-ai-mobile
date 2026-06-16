import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
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
  RefreshCw,
  RotateCcw,
  Trash2,
  User,
  UserCircle,
  Users,
  X,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthContext';
import { GoogleLogo } from '@/components/BrandLogos';
import { BACKEND_URL } from '@/auth/constants';
import { formatExpiryLabel, formatPlanLabel } from '@/auth/plan';
import type { SyncedProfile, SyncedProfileGroup } from '@/auth/types';
import Text from '@/components/ui/KubdeeText';
import FlowWebView, { type FlowAccount, type FlowConnectionState } from '@/flow/FlowWebView';
import {
  loadFlowAccount,
  loadFlowConnectionState,
  saveFlowAccount,
  saveFlowConnectionState,
} from '@/flow/flowConnection';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';

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
  const inverseText = theme.isDark ? '#111827' : theme.white;

  return (
    <View
      className={`flex-row items-stretch overflow-hidden rounded-kd-xl border ${
        active
          ? 'border-kd-border-strong bg-kd-panel-muted dark:bg-kd-card-muted'
          : 'border-kd-border bg-kd-panel'
      }`}
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        activeOpacity={0.78}
        disabled={disabled}
        onPress={() => onSelect?.(profile.id)}
        className="min-w-0 flex-1 flex-row items-center gap-2 px-2.5 py-2 disabled:opacity-60"
      >
        <View
          className={`h-7 w-7 shrink-0 items-center justify-center rounded-kd-lg ${
            active ? 'bg-gray-900 dark:bg-white' : 'bg-kd-panel-muted dark:bg-kd-card-muted'
          }`}
        >
          <User
            size={14}
            color={active ? inverseText : theme.textSubtle}
            strokeWidth={2.2}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
            {profile.name}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 text-kd-micro font-medium text-kd-text-subtle">
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
          className="w-9 items-center justify-center disabled:opacity-50"
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
    <View className="rounded-kd-xl border border-kd-amber/35 bg-kd-amber/10 p-2 dark:border-kd-amber/40">
      <View className="flex-row items-start gap-2">
        <View className="h-7 w-7 shrink-0 items-center justify-center rounded-kd-lg bg-kd-amber/15 dark:bg-kd-amber/20">
          <Archive size={14} color={theme.amber} strokeWidth={2.2} />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text numberOfLines={1} className="min-w-0 flex-1 text-kd-body font-semibold text-kd-text">
              {profile.name}
            </Text>
            <Text numberOfLines={1} className="shrink-0 text-kd-tiny font-semibold text-kd-amber">
              ถูกลบจาก {getDeletedSourceLabel(profile)}
            </Text>
          </View>
          <Text numberOfLines={1} className="mt-0.5 text-kd-micro font-medium text-kd-amber/85">
            {group?.name || 'ไม่มีกลุ่ม'} · {formatShortId(profile.id)}
          </Text>
        </View>
      </View>

      <View className="mt-2 flex-row gap-1.5">
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.78}
          disabled={disabled}
          onPress={() => onRestore?.(profile)}
          className="h-7 flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-lg border border-kd-emerald/40 bg-kd-emerald/10 disabled:opacity-50 dark:bg-kd-emerald/15"
        >
          <RotateCcw size={12} color={theme.emerald} strokeWidth={2.3} />
          <Text className="text-kd-micro font-semibold text-kd-emerald">กู้คืน</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.78}
          disabled={disabled}
          onPress={() => onConfirmDelete?.(profile)}
          className="h-7 flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-lg border border-kd-red/40 bg-kd-red/10 disabled:opacity-50 dark:bg-kd-red/15"
        >
          <Check size={12} color={theme.red} strokeWidth={2.3} />
          <Text className="text-kd-micro font-semibold text-kd-red">ซ่อน</Text>
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
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowState, setFlowState] = useState<FlowConnectionState | null>(null);
  const [flowAccount, setFlowAccount] = useState<FlowAccount | null>(null);
  const [flowReloadKey, setFlowReloadKey] = useState(0);

  useEffect(() => {
    void loadFlowConnectionState().then((stored) => {
      if (stored) {
        setFlowState(stored);
      }
    });
    void loadFlowAccount().then((account) => {
      if (account) {
        setFlowAccount(account);
      }
    });
  }, []);

  const flowConnected = flowState === 'connected';
  const handleFlowStatus = (state: FlowConnectionState): void => {
    setFlowState(state);
    void saveFlowConnectionState(state);
  };
  const handleFlowAccount = (account: FlowAccount): void => {
    setFlowAccount((prev) => {
      const merged: FlowAccount = {
        email: account.email || prev?.email,
        name: account.name || prev?.name,
        photo: account.photo || prev?.photo,
      };
      void saveFlowAccount(merged);
      return merged;
    });
  };

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
  const syncToneClass =
    syncStatus === 'syncing'
      ? 'border-kd-blue/40 bg-kd-blue/10 dark:bg-kd-blue/15'
      : syncStatus === 'success'
        ? 'border-kd-emerald/40 bg-kd-emerald/10 dark:bg-kd-emerald/15'
        : syncStatus === 'error'
          ? 'border-kd-red/40 bg-kd-red/10 dark:bg-kd-red/15'
          : 'border-kd-border bg-kd-panel';

  const inverseText = theme.isDark ? '#111827' : theme.white;

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

  // Google Flow connection block. Shown at the TOP when not connected yet (to prompt the user to
  // log in), or tucked back down near the account section once connected.
  const flowSection = (
    <View className="gap-3">
      {/* Header only once connected (when it sits down near the account section). */}
      {flowConnected ? (
        <View className="mt-1 flex-row items-center justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <GoogleLogo size={14} />
            <Text className="shrink text-kd-caption font-semibold text-kd-text-muted">Google Flow</Text>
          </View>
        </View>
      ) : null}

      <View
        className={`gap-2 rounded-kd-xl border p-2 ${
          flowConnected ? 'border-kd-border bg-kd-panel' : 'border-kd-orange bg-kd-orange-soft'
        }`}
      >
        <View className="flex-row items-center gap-2">
          {flowConnected && flowAccount?.photo ? (
            <Image source={{ uri: flowAccount.photo }} className="h-[38px] w-[38px] rounded-kd-xl" />
          ) : (
            <View className="h-[38px] w-[38px] items-center justify-center rounded-kd-xl bg-white dark:bg-kd-card-muted">
              <GoogleLogo size={20} />
            </View>
          )}
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
              {flowConnected && flowAccount?.name ? flowAccount.name : 'เชื่อมต่อ Google Flow'}
            </Text>
            <Text numberOfLines={1} className="mt-px text-kd-micro font-medium text-kd-text-subtle">
              {flowConnected
                ? flowAccount?.email || 'login ครั้งเดียว ใช้สร้างวิดีโออัตโนมัติบนเครื่องนี้'
                : 'ยังไม่เชื่อม — เข้าสู่ระบบ Google ก่อนเริ่มใช้งาน'}
            </Text>
          </View>
          <View
            className={`shrink-0 rounded-kd-md border px-2 py-1 ${
              flowConnected
                ? 'border-kd-emerald/40 bg-kd-emerald/10 dark:bg-kd-emerald/15'
                : 'border-kd-orange bg-white dark:bg-kd-card-muted'
            }`}
          >
            <Text
              className={`text-kd-tiny font-semibold ${
                flowConnected ? 'text-kd-emerald' : 'text-kd-orange'
              }`}
            >
              {flowConnected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.82}
          onPress={() => {
            setFlowReloadKey((key) => key + 1);
            setFlowOpen(true);
          }}
          className={`h-[34px] flex-row items-center justify-center gap-1.5 rounded-kd-lg border ${
            flowConnected ? 'border-kd-border bg-kd-panel' : 'border-transparent bg-kd-orange'
          }`}
        >
          <Text
            className={`text-kd-caption font-semibold ${
              flowConnected ? 'text-kd-text-muted' : 'text-white'
            }`}
          >
            {flowConnected ? 'จัดการการเชื่อมต่อ' : 'เชื่อมต่อ / เข้าสู่ระบบ Google Flow'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 px-3 pb-20 pt-3">
        {/* Google Flow — show on top until connected, then it moves down near the account section */}
        {flowConnected ? null : flowSection}

        {/* Extension: โปรไฟล์ header — Users icon + sync button + เพิ่ม */}
        <View className="flex-row items-center justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <Users size={14} color={theme.text} strokeWidth={2.4} />
            <Text numberOfLines={1} className="shrink text-kd-caption font-semibold text-kd-text-muted">
              โปรไฟล์
            </Text>
          </View>
          <View className="shrink-0 flex-row items-center gap-1.5">
            <TouchableOpacity
              accessibilityLabel="ซิงก์โปรไฟล์กับ Cloud"
              accessibilityRole="button"
              activeOpacity={0.78}
              disabled={isSyncing}
              onPress={() => {
                void syncProfile();
              }}
              className={`h-7 w-7 items-center justify-center rounded-kd-lg border ${syncToneClass}`}
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
              className="h-7 flex-row items-center gap-1 rounded-kd-lg bg-gray-900 px-2.5 dark:bg-white"
            >
              <Plus size={12} color={inverseText} strokeWidth={2.5} />
              <Text className="text-kd-caption font-semibold text-white dark:text-gray-900">เพิ่ม</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Extension: sync stats card */}
        <View className="rounded-kd-xl border border-kd-border bg-kd-panel p-2">
          <View className="mb-1.5 flex-row items-center justify-between gap-2">
            <Text className="text-kd-micro font-medium text-kd-text-subtle">ซิงก์ล่าสุด</Text>
            <Text className="text-kd-caption font-semibold text-kd-text-muted">
              {formatSyncLabel(lastProfilesSyncedAt || lastSyncedAt)}
            </Text>
          </View>

          <View className="flex-row gap-1">
            <View className="flex-1 rounded-kd-md bg-kd-card-muted px-2 py-[5px] dark:bg-kd-panel-muted">
              <Text className="text-[8px] font-medium text-kd-text-subtle">ใช้งานอยู่</Text>
              <Text className="mt-px text-kd-body font-semibold text-kd-text">
                {formatCount(syncedProfiles.length)}
              </Text>
            </View>
            <View className="flex-1 rounded-kd-md bg-kd-card-muted px-2 py-[5px] dark:bg-kd-panel-muted">
              <Text className="text-[8px] font-medium text-kd-text-subtle">กลุ่ม</Text>
              <Text className="mt-px text-kd-body font-semibold text-kd-text">
                {formatCount(syncedProfileGroups.length)}
              </Text>
            </View>
            <View className="flex-1 rounded-kd-md bg-kd-card-muted px-2 py-[5px] dark:bg-kd-panel-muted">
              <Text className="text-[8px] font-medium text-kd-text-subtle">ถูกลบ</Text>
              <Text className="mt-px text-kd-body font-semibold text-kd-text">
                {formatCount(deletedSyncedProfiles.length)}
              </Text>
            </View>
          </View>

          {selectedProfile ? (
            <View className="mt-1.5 rounded-kd-lg border border-kd-border-strong bg-kd-panel-muted px-2 py-1.5 dark:bg-kd-card-muted">
              <View className="flex-row items-center gap-2">
                <Text className="shrink-0 text-kd-tiny font-semibold text-kd-text-muted">ใช้งาน</Text>
                <Text numberOfLines={1} className="min-w-0 flex-1 text-kd-body font-semibold text-kd-text">
                  {selectedProfile.name}
                </Text>
              </View>
              <Text numberOfLines={1} className="mt-0.5 text-kd-micro font-medium text-kd-text-subtle">
                {selectedGroup?.name || 'ไม่มีกลุ่ม'} ·{' '}
                {getSourceLabel(selectedProfile.createdByApp || selectedProfile.originApp)} ·{' '}
                {formatShortId(selectedProfile.id)}
              </Text>
            </View>
          ) : null}

          {syncError ? (
            <View className="mt-1.5 rounded-kd-lg border border-kd-red/35 bg-kd-red/5 px-2.5 py-2 dark:bg-kd-red/10">
              <Text className="text-kd-caption font-semibold leading-4 text-kd-red">{syncError}</Text>
            </View>
          ) : null}
        </View>

        {/* Extension: โปรไฟล์ทั้งหมด */}
        <View className="mt-1 flex-row items-center justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <User size={14} color={theme.text} strokeWidth={2.4} />
            <Text className="shrink text-kd-caption font-semibold text-kd-text-muted">โปรไฟล์ทั้งหมด</Text>
          </View>
          <Text className="shrink-0 text-kd-micro font-medium text-kd-text-subtle">
            {formatCount(syncedProfiles.length)} รายการ
          </Text>
        </View>

        {isSyncingProfiles && syncedProfiles.length === 0 ? (
          <View className="items-center gap-1.5 rounded-kd-xl border border-dashed border-kd-border bg-kd-card-muted px-4 py-5 dark:bg-kd-panel-muted">
            <ActivityIndicator color={theme.blue} size="small" />
            <Text className="text-center text-kd-body font-semibold text-kd-text">กำลังโหลดโปรไฟล์จาก Cloud</Text>
          </View>
        ) : syncedProfiles.length === 0 ? (
          <View className="items-center gap-1.5 rounded-kd-xl border border-dashed border-kd-border bg-kd-card-muted px-4 py-5 dark:bg-kd-panel-muted">
            <User size={20} color={theme.textSubtle} strokeWidth={2} />
            <Text className="text-center text-kd-body font-semibold text-kd-text">ยังไม่มีโปรไฟล์ใช้งานอยู่</Text>
            <Text className="text-center text-kd-micro font-medium leading-[15px] text-kd-text-subtle">
              สร้างโปรไฟล์แรกบนมือถือ แล้วระบบจะซิงก์ขึ้น Cloud
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.82}
              onPress={() => setCreateOpen(true)}
              className="mt-1 h-7 items-center justify-center rounded-kd-lg bg-gray-900 px-3 dark:bg-white"
            >
              <Text className="text-kd-micro font-semibold text-white dark:text-gray-900">สร้างโปรไฟล์แรก</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="gap-2">
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
            <View className="mt-1 flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <Archive size={14} color={theme.amber} strokeWidth={2.4} />
                <Text className="shrink text-kd-caption font-semibold text-kd-amber">โปรไฟล์ที่ถูกลบ</Text>
              </View>
              <Text className="shrink-0 text-kd-micro font-medium text-kd-amber">
                {formatCount(deletedSyncedProfiles.length)} รอจัดการ
              </Text>
            </View>
            <View className="gap-2">
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
        <View className="mt-1 flex-row items-center justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <UserCircle size={14} color={theme.text} strokeWidth={2.4} />
            <Text className="shrink text-kd-caption font-semibold text-kd-text-muted">บัญชี</Text>
          </View>
        </View>

        <View className="gap-2 rounded-kd-xl border border-kd-border bg-kd-panel p-2">
          <View className="flex-row items-center gap-2">
            {user?.image ? (
              <Image source={{ uri: user.image }} className="h-[38px] w-[38px] rounded-kd-xl" />
            ) : (
              <View className="h-[38px] w-[38px] items-center justify-center rounded-kd-xl bg-kd-card-muted dark:bg-kd-panel-muted">
                <UserCircle size={20} color={theme.textSubtle} strokeWidth={2} />
              </View>
            )}
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
                {displayName}
              </Text>
              <Text numberOfLines={1} className="mt-px text-kd-micro font-medium text-kd-text-subtle">
                {user?.email || 'Google account'}
              </Text>
            </View>
          </View>

          <View className="flex-row gap-1">
            <View className="flex-1 rounded-kd-md bg-kd-card-muted px-2 py-[5px] dark:bg-kd-panel-muted">
              <Text className="text-[8px] font-medium text-kd-text-subtle">แผน</Text>
              <Text numberOfLines={1} className="mt-px text-kd-body font-semibold text-kd-text">
                {planLabel}
              </Text>
              <Text numberOfLines={1} className="mt-px text-[8px] font-medium text-kd-text-subtle">
                {expiryLabel}
              </Text>
            </View>
            <View className="flex-1 rounded-kd-md bg-kd-card-muted px-2 py-[5px] dark:bg-kd-panel-muted">
              <Text className="text-[8px] font-medium text-kd-text-subtle">เครดิต</Text>
              <Text numberOfLines={1} className="mt-px text-kd-body font-semibold text-kd-text">
                {formatCredits(user?.credits)}
              </Text>
            </View>
            <View className="flex-1 rounded-kd-md bg-kd-card-muted px-2 py-[5px] dark:bg-kd-panel-muted">
              <Text className="text-[8px] font-medium text-kd-text-subtle">อุปกรณ์</Text>
              <Text numberOfLines={1} className="mt-px text-kd-body font-semibold text-kd-text">
                {devicesLabel}
              </Text>
              <Text numberOfLines={1} className="mt-px text-[8px] font-medium text-kd-text-subtle">
                active/max
              </Text>
            </View>
          </View>

          <View className="flex-row gap-2">
            <TouchableOpacity
              accessibilityRole="link"
              activeOpacity={0.78}
              onPress={() => Linking.openURL(BACKEND_URL)}
              className="h-[34px] flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-lg border border-kd-border bg-kd-panel"
            >
              <Globe2 size={13} color={theme.textMuted} strokeWidth={2.2} />
              <Text className="text-kd-caption font-semibold text-kd-text-muted">เปิดเว็บ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.78}
              onPress={logout}
              className="h-[34px] flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-lg border border-kd-red/35 bg-kd-red/5 dark:bg-kd-red/10"
            >
              <LogOut size={13} color={theme.red} strokeWidth={2.2} />
              <Text className="text-kd-caption font-semibold text-kd-red">ออกจากระบบ</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Google Flow — once connected it lives down here near the account section */}
        {flowConnected ? flowSection : null}
      </ScrollView>

      {/* Extension: create profile modal overlay */}
      <Modal animationType="fade" transparent visible={createOpen} onRequestClose={closeCreateModal}>
        <View className="flex-1 items-center justify-center bg-black/45 px-4">
          <View className="w-full max-w-[360px] rounded-xl border border-kd-border bg-kd-panel">
            <View className="flex-row items-center justify-between gap-2 border-b border-kd-border px-3 py-2.5">
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <View className="h-7 w-7 shrink-0 items-center justify-center rounded-kd-lg bg-kd-card-muted dark:bg-kd-panel-muted">
                  <User size={14} color={theme.textMuted} strokeWidth={2.2} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
                    สร้างโปรไฟล์ใหม่
                  </Text>
                  <Text numberOfLines={1} className="mt-px text-kd-micro font-medium text-kd-text-subtle">
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
                className="h-7 w-7 items-center justify-center rounded-kd-lg"
              >
                <X size={14} color={theme.textSubtle} strokeWidth={2.4} />
              </TouchableOpacity>
            </View>

            <View className="gap-3 p-3">
              <View className="gap-[5px]">
                <Text className="text-kd-micro font-bold text-kd-text-subtle">ชื่อโปรไฟล์</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setProfileName}
                  placeholder="เช่น ร้านหลัก"
                  placeholderTextColor={theme.textSubtle}
                  returnKeyType="done"
                  className="min-h-[36px] rounded-kd-lg border border-kd-border bg-kd-card-muted px-2.5 py-2 text-kd-body text-kd-text dark:bg-kd-panel-muted"
                  style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
                  value={profileName}
                />
              </View>

              <View className="gap-[5px]">
                <Text className="text-kd-micro font-bold text-kd-text-subtle">กลุ่ม</Text>
                <View className="flex-row flex-wrap gap-1.5">
                  <TouchableOpacity
                    activeOpacity={0.78}
                    onPress={() => setSelectedGroupId(GROUP_NONE)}
                    className={`h-[30px] max-w-[150px] flex-row items-center gap-[5px] rounded-kd-lg border px-2.5 ${
                      selectedGroupId === GROUP_NONE
                        ? 'border-kd-border-strong bg-kd-panel-muted dark:bg-kd-card-muted'
                        : 'border-kd-border bg-kd-card-muted dark:bg-kd-panel-muted'
                    }`}
                  >
                    <Text
                      numberOfLines={1}
                      className={`shrink text-kd-micro font-semibold ${
                        selectedGroupId === GROUP_NONE ? 'text-kd-text' : 'text-kd-text-subtle'
                      }`}
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
                        className={`h-[30px] max-w-[150px] flex-row items-center gap-[5px] rounded-kd-lg border px-2.5 ${
                          selected
                            ? 'border-kd-border-strong bg-kd-panel-muted dark:bg-kd-card-muted'
                            : 'border-kd-border bg-kd-card-muted dark:bg-kd-panel-muted'
                        }`}
                      >
                        <Text
                          numberOfLines={1}
                          className={`shrink text-kd-micro font-semibold ${
                            selected ? 'text-kd-text' : 'text-kd-text-subtle'
                          }`}
                        >
                          {group.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    activeOpacity={0.78}
                    onPress={() => setSelectedGroupId(GROUP_NEW)}
                    className={`h-[30px] max-w-[150px] flex-row items-center gap-[5px] rounded-kd-lg border px-2.5 ${
                      selectedGroupId === GROUP_NEW
                        ? 'border-kd-border-strong bg-kd-panel-muted dark:bg-kd-card-muted'
                        : 'border-kd-border bg-kd-card-muted dark:bg-kd-panel-muted'
                    }`}
                  >
                    <FolderPlus
                      size={12}
                      color={selectedGroupId === GROUP_NEW ? theme.text : theme.textSubtle}
                      strokeWidth={2.2}
                    />
                    <Text
                      numberOfLines={1}
                      className={`shrink text-kd-micro font-semibold ${
                        selectedGroupId === GROUP_NEW ? 'text-kd-text' : 'text-kd-text-subtle'
                      }`}
                    >
                      สร้างกลุ่มใหม่
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {selectedGroupId === GROUP_NEW ? (
                <View className="gap-[5px]">
                  <Text className="text-kd-micro font-bold text-kd-text-subtle">ชื่อกลุ่มใหม่</Text>
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={setNewGroupName}
                    placeholder="เช่น TikTok"
                    placeholderTextColor={theme.textSubtle}
                    returnKeyType="done"
                    className="min-h-[36px] rounded-kd-lg border border-kd-border bg-kd-card-muted px-2.5 py-2 text-kd-body text-kd-text dark:bg-kd-panel-muted"
                    style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
                    value={newGroupName}
                  />
                </View>
              ) : null}

              {createProfileError ? (
                <View className="mt-1.5 rounded-kd-lg border border-kd-red/35 bg-kd-red/5 px-2.5 py-2 dark:bg-kd-red/10">
                  <Text className="text-kd-caption font-semibold leading-4 text-kd-red">{createProfileError}</Text>
                </View>
              ) : null}

              <View className="flex-row gap-2 pt-0.5">
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.78}
                  disabled={isCreatingProfile}
                  onPress={closeCreateModal}
                  className="h-[34px] flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-lg border border-kd-border bg-kd-panel disabled:opacity-50"
                >
                  <Text className="text-kd-body font-semibold text-kd-text-muted">ยกเลิก</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.82}
                  disabled={createDisabled}
                  onPress={() => {
                    void handleCreateProfile();
                  }}
                  className="h-[34px] flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-lg border border-transparent bg-gray-900 disabled:opacity-50 dark:bg-white"
                >
                  {isCreatingProfile ? (
                    <ActivityIndicator color={inverseText} size="small" />
                  ) : null}
                  <Text className="text-kd-body font-semibold text-white dark:text-gray-900">
                    {isCreatingProfile ? 'กำลังสร้าง' : 'สร้างโปรไฟล์'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Google Flow connection (WebView login) modal */}
      <Modal animationType="slide" visible={flowOpen} onRequestClose={() => setFlowOpen(false)}>
        <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-kd-screen">
          <View className="flex-row items-center gap-2 border-b border-kd-border bg-kd-panel px-3 py-2">
            <GoogleLogo size={16} />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
                Google Flow
              </Text>
              <Text numberOfLines={1} className="text-kd-micro font-medium text-kd-text-subtle">
                {flowState === 'connected'
                  ? 'เชื่อมต่อแล้ว — login ครั้งเดียวใช้ได้ตลอด'
                  : flowState === 'signin'
                    ? 'กำลังเข้าสู่ระบบ Google…'
                    : 'เข้าสู่ระบบ Google เพื่อเชื่อมต่อ'}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="โหลดใหม่"
              accessibilityRole="button"
              activeOpacity={0.7}
              onPress={() => setFlowReloadKey((key) => key + 1)}
              className="h-8 w-8 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-panel"
            >
              <RefreshCw size={15} color={theme.textMuted} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="ปิด"
              accessibilityRole="button"
              activeOpacity={0.7}
              onPress={() => setFlowOpen(false)}
              className="h-8 w-8 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-panel"
            >
              <X size={16} color={theme.textSubtle} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
          <FlowWebView
            key={flowReloadKey}
            backgroundColor={theme.screen}
            onStatusChange={handleFlowStatus}
            onAccount={handleFlowAccount}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
