import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { AlertTriangle, Check } from 'lucide-react-native';
import { getBufferConnectionStatus, listBufferChannelsByService } from '@/autopilot/bufferPosting';
import type { BufferChannel, BufferChannelService } from '@/autopilot/bufferPosting';
import { FacebookLogo, InstagramLogo, YouTubeLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { FACEBOOK_BLUE, INSTAGRAM_PINK, YOUTUBE_RED } from '@/theme/brandColors';
import type { KubdeeTheme } from '@/theme/tokens';

// Chip pill layout: 1 row when channels fit, capped at 2 rows tall — extra
// channels scroll instead of growing the header past 2 rows.
const CHANNEL_CHIP_HEIGHT = 32;
const CHANNEL_CHIP_GAP = 6;
const CHANNEL_PICKER_HEIGHT = CHANNEL_CHIP_HEIGHT * 2 + CHANNEL_CHIP_GAP;

type LoadState = 'loading' | 'not_connected' | 'no_channels' | 'ready' | 'error';

// Posting goes through Buffer, and Buffer connection (entering the API key)
// only happens on the web (kubdee.ai/settings) by design — mobile only reads
// the connection status + channel list, it never lets the user paste a key
// here.
function BufferChannelPickerBlock({
  service,
  serviceLabel,
  accent,
  renderLogo,
  channelId,
  theme,
  onSelectChannel,
  onClearChannel,
}: {
  service: BufferChannelService;
  serviceLabel: string;
  accent: string;
  renderLogo: () => React.JSX.Element;
  channelId: string | null;
  theme: KubdeeTheme;
  onSelectChannel: (channelId: string) => void;
  onClearChannel: () => void;
}): React.JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [channels, setChannels] = useState<BufferChannel[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoadState('loading');
      try {
        const status = await getBufferConnectionStatus();
        if (cancelled) return;
        if (!status.connected) {
          setLoadState('not_connected');
          return;
        }

        const serviceChannels = await listBufferChannelsByService(service);
        if (cancelled) return;
        setChannels(serviceChannels);
        setLoadState(serviceChannels.length > 0 ? 'ready' : 'no_channels');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [service]);

  useEffect(() => {
    if (loadState !== 'ready') return;
    // Selecting a channel is an explicit user action (it's what enables
    // posting), so never auto-pick one — but do clear a persisted channel
    // that no longer exists on Buffer's side (removed/disconnected since it
    // was last picked), otherwise a stale id would silently fail every post.
    if (channelId && !channels.some((channel) => channel.id === channelId)) {
      onClearChannel();
    }
  }, [loadState, channelId, channels, onClearChannel]);

  if (loadState === 'loading') {
    return (
      <View className="h-8 flex-row items-center gap-1.5">
        <ActivityIndicator size="small" color={theme.textSubtle} />
        <Text className="text-kd-caption text-kd-text-subtle">กำลังโหลดช่อง...</Text>
      </View>
    );
  }

  if (loadState === 'not_connected') {
    return (
      <View className="flex-row items-start gap-1.5">
        <AlertTriangle size={13} color={theme.amber} strokeWidth={2.2} style={{ marginTop: 2 }} />
        <Text numberOfLines={2} className="flex-1 text-kd-caption text-kd-text-subtle">
          ยังไม่ได้เชื่อมต่อ Buffer — ไปเชื่อมต่อที่เว็บ kubdee.ai/settings ก่อน แล้วกลับมาเปิดใช้งานอีกครั้ง
        </Text>
      </View>
    );
  }

  if (loadState === 'no_channels') {
    return (
      <View className="flex-row items-start gap-1.5">
        <AlertTriangle size={13} color={theme.amber} strokeWidth={2.2} style={{ marginTop: 2 }} />
        <Text numberOfLines={2} className="flex-1 text-kd-caption text-kd-text-subtle">
          ยังไม่มี channel {serviceLabel} เชื่อมต่อกับ Buffer อยู่ — ไปเพิ่มที่เว็บ Buffer ก่อน
        </Text>
      </View>
    );
  }

  if (loadState === 'error') {
    return (
      <View className="h-8 flex-row items-center gap-1.5">
        <AlertTriangle size={13} color={theme.red} strokeWidth={2.2} />
        <Text className="text-kd-caption text-kd-text-subtle">เช็คการเชื่อมต่อ Buffer ไม่สำเร็จ ลองอีกครั้ง</Text>
      </View>
    );
  }

  const selectedId = channelId ?? '';

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ maxHeight: CHANNEL_PICKER_HEIGHT }}
      contentContainerClassName="flex-row flex-wrap gap-1.5"
    >
      {channels.map((channel) => {
        const selected = channel.id === selectedId;
        // คิวหยุดชั่วคราวสำคัญกว่าสถานะเลือก — เตือนสีเหลืองทับได้แม้กำลังเลือกอยู่
        const borderColor = channel.isQueuePaused ? theme.amber : selected ? accent : theme.border;
        return (
          <Pressable
            key={channel.id}
            accessibilityRole="button"
            onPress={() => (selected ? onClearChannel() : onSelectChannel(channel.id))}
            className="h-8 flex-row items-center gap-1.5 rounded-full border bg-kd-input py-1 pl-1 pr-2.5"
            style={{ borderColor }}
          >
            <View className="h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-full bg-kd-panel-muted dark:bg-kd-card-muted">
              {channel.avatar ? (
                <Image source={{ uri: channel.avatar }} className="h-full w-full" resizeMode="cover" />
              ) : (
                renderLogo()
              )}
            </View>
            <Text numberOfLines={1} className="max-w-[112px] text-kd-caption font-medium text-kd-text">
              {channel.displayName || channel.name}
            </Text>
            {selected ? <Check size={13} color={accent} strokeWidth={2.5} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function FacebookPostingSettingsBlock({
  facebookChannelId,
  theme,
  onSelectChannel,
  onClearChannel,
}: {
  facebookChannelId: string | null;
  theme: KubdeeTheme;
  onSelectChannel: (channelId: string) => void;
  onClearChannel: () => void;
}): React.JSX.Element {
  return (
    <BufferChannelPickerBlock
      service="facebook"
      serviceLabel="Facebook"
      accent={FACEBOOK_BLUE}
      renderLogo={() => <FacebookLogo size={20} color={FACEBOOK_BLUE} cutoutColor={theme.input} />}
      channelId={facebookChannelId}
      theme={theme}
      onSelectChannel={onSelectChannel}
      onClearChannel={onClearChannel}
    />
  );
}

export function YoutubePostingSettingsBlock({
  youtubeChannelId,
  theme,
  onSelectChannel,
  onClearChannel,
}: {
  youtubeChannelId: string | null;
  theme: KubdeeTheme;
  onSelectChannel: (channelId: string) => void;
  onClearChannel: () => void;
}): React.JSX.Element {
  return (
    <BufferChannelPickerBlock
      service="youtube"
      serviceLabel="YouTube"
      accent={YOUTUBE_RED}
      renderLogo={() => <YouTubeLogo size={20} color={YOUTUBE_RED} cutoutColor={theme.input} />}
      channelId={youtubeChannelId}
      theme={theme}
      onSelectChannel={onSelectChannel}
      onClearChannel={onClearChannel}
    />
  );
}

export function InstagramPostingSettingsBlock({
  instagramChannelId,
  theme,
  onSelectChannel,
  onClearChannel,
}: {
  instagramChannelId: string | null;
  theme: KubdeeTheme;
  onSelectChannel: (channelId: string) => void;
  onClearChannel: () => void;
}): React.JSX.Element {
  return (
    <BufferChannelPickerBlock
      service="instagram"
      serviceLabel="Instagram"
      accent={INSTAGRAM_PINK}
      renderLogo={() => <InstagramLogo size={20} color={INSTAGRAM_PINK} />}
      channelId={instagramChannelId}
      theme={theme}
      onSelectChannel={onSelectChannel}
      onClearChannel={onClearChannel}
    />
  );
}
