import { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
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
  Globe2,
  HardDrive,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Users,
  UserCircle,
} from 'lucide-react-native';

import { useAuth } from '@/auth/AuthContext';
import { BACKEND_URL } from '@/auth/constants';
import { formatExpiryLabel, formatPlanLabel } from '@/auth/plan';
import type { SyncedProfile, SyncedProfileCredential, SyncedProfileGroup } from '@/auth/types';
import Text from '@/components/ui/KubdeeText';
import SectionHeader from '@/components/ui/SectionHeader';
import StatusPill from '@/components/ui/StatusPill';
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
  credentials: SyncedProfileCredential[];
}

interface SyncedProfileRowProps {
  row: ProfileListRow;
  theme: KubdeeTheme;
}

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

function getWebsites(credentials: SyncedProfileCredential[]): string[] {
  const websites = credentials.map((credential) => credential.website).filter(Boolean);
  return Array.from(new Set(websites));
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

function SyncedProfileRow({ row, theme }: SyncedProfileRowProps): React.JSX.Element {
  const websites = getWebsites(row.credentials);
  const visibleWebsites = websites.slice(0, 2);
  const hiddenWebsiteCount = Math.max(websites.length - visibleWebsites.length, 0);

  return (
    <View style={[styles.syncedProfileRow, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
      <View style={[styles.syncedProfileIcon, { backgroundColor: theme.cyanSoft }]}>
        <UserCircle size={18} color={theme.cyan} strokeWidth={2.2} />
      </View>
      <View style={styles.syncedProfileBody}>
        <Text style={[styles.syncedProfileName, { color: theme.text }]} numberOfLines={1}>
          {row.profile.name}
        </Text>
        <Text style={[styles.syncedProfileMeta, { color: theme.textSubtle }]} numberOfLines={1}>
          {row.group?.name || 'ไม่มีกลุ่ม'} · {row.profile.localId}
        </Text>
        {visibleWebsites.length > 0 ? (
          <View style={styles.websiteChips}>
            {visibleWebsites.map((website) => (
              <View key={website} style={[styles.websiteChip, { backgroundColor: theme.panelMuted }]}>
                <Text style={[styles.websiteChipText, { color: theme.textSubtle }]} numberOfLines={1}>
                  {website}
                </Text>
              </View>
            ))}
            {hiddenWebsiteCount > 0 ? (
              <View style={[styles.websiteChip, { backgroundColor: theme.panelMuted }]}>
                <Text style={[styles.websiteChipText, { color: theme.textSubtle }]}>+{hiddenWebsiteCount}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={[styles.credentialBadge, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <KeyRound size={12} color={theme.textSubtle} strokeWidth={2.2} />
        <Text style={[styles.credentialCount, { color: theme.text }]}>{formatCount(row.credentials.length)}</Text>
      </View>
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
    isCheckingPlan,
    isSyncingProfiles,
    lastSyncedAt,
    logout,
    profileCredentials,
    profileDataError,
    profileSyncError,
    syncProfile,
    syncedProfileGroups,
    syncedProfiles,
    user,
  } = useAuth();
  const displayName = user?.name || user?.email || 'Kubdee AI User';
  const planLabel = formatPlanLabel(user?.plan);
  const expiryLabel = formatExpiryLabel(user?.expiryDate);
  const devicesLabel = `${user?.activeDevices ?? 0}/${user?.maxDevices ?? 0}`;
  const syncError = profileSyncError || profileDataError;
  const isSyncing = isCheckingPlan || isSyncingProfiles;
  const syncStatusLabel = isSyncing ? 'SYNCING' : syncError ? 'ERROR' : 'SYNCED';
  const syncStatusColor = syncError ? theme.red : theme.emerald;
  const syncStatusBackground = syncError ? theme.redSoft : theme.emeraldSoft;
  const profileRows = useMemo<ProfileListRow[]>(() => {
    const groupByLocalId = new Map(syncedProfileGroups.map((group) => [group.localId, group]));
    const credentialsByProfile = new Map<string, SyncedProfileCredential[]>();

    for (const credential of profileCredentials) {
      const credentials = credentialsByProfile.get(credential.profileLocalId) ?? [];
      credentials.push(credential);
      credentialsByProfile.set(credential.profileLocalId, credentials);
    }

    return syncedProfiles.map((profile) => ({
      profile,
      group: profile.groupLocalId == null ? null : groupByLocalId.get(profile.groupLocalId) ?? null,
      credentials: credentialsByProfile.get(profile.localId) ?? [],
    }));
  }, [profileCredentials, syncedProfileGroups, syncedProfiles]);

  useEffect(() => {
    void syncProfile();
  }, [syncProfile]);

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
            icon={profileSyncError ? ShieldCheck : CheckCircle2}
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
              kubdee.ai · ซิงก์ล่าสุด {formatSyncLabel(lastSyncedAt)}
            </Text>
          </View>
        </View>
        <StatusPill backgroundColor={theme.blue} color={theme.white} icon={BadgeCheck} label="WEB" />
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

      <SectionHeader icon={ShieldCheck} theme={theme} title="ข้อมูลจากเว็บ" />
      <View style={styles.infoGroup}>
        <InfoRow icon={CalendarDays} label="หมดอายุ" theme={theme} value={expiryLabel} />
        <InfoRow icon={ShieldCheck} label="สิทธิ์" theme={theme} value="Ultra plan เหมือน Desktop" />
        <InfoRow icon={UserCircle} label="User ID" theme={theme} value={user?.id || '-'} />
      </View>

      <SectionHeader
        icon={Users}
        theme={theme}
        title="โปรไฟล์ย่อยจาก Desktop"
        right={
          <StatusPill
            backgroundColor={theme.cyanSoft}
            color={theme.cyan}
            icon={UserCircle}
            label={`${formatCount(syncedProfiles.length)} โปรไฟล์`}
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
          icon={KeyRound}
          label="Accounts"
          theme={theme}
          value={formatCount(profileCredentials.length)}
        />
      </View>

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
          <Text style={[styles.emptyTitle, { color: theme.text }]}>ยังไม่มีโปรไฟล์ย่อย</Text>
          <Text style={[styles.emptyDescription, { color: theme.textSubtle }]}>
            ให้ซิงก์โปรไฟล์จาก Desktop ขึ้น kubdee.ai ก่อน
          </Text>
        </View>
      ) : (
        <View style={styles.syncedProfileList}>
          {profileRows.map((row) => (
            <SyncedProfileRow key={row.profile.localId} row={row} theme={theme} />
          ))}
        </View>
      )}

      <View style={styles.actionList}>
        <ActionRow
          disabled={isSyncing}
          icon={RefreshCw}
          iconBackground={theme.blue}
          iconColor={theme.white}
          label="ซิงก์โปรไฟล์จากเว็บ"
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
  credentialBadge: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  credentialCount: {
    fontSize: typography.caption,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 14,
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
  websiteChip: {
    borderRadius: radii.sm,
    maxWidth: 110,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  websiteChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 5,
  },
  websiteChipText: {
    fontSize: typography.tiny,
    fontWeight: '800',
    includeFontPadding: false,
    lineHeight: 12,
  },
});
