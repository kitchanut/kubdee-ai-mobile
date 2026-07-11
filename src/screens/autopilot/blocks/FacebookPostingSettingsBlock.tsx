import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { AlertTriangle, Check } from 'lucide-react-native';
import { getBufferConnectionStatus, listBufferChannelsByService } from '@/autopilot/bufferPosting';
import type { BufferChannel, BufferChannelService } from '@/autopilot/bufferPosting';
import { FacebookLogo, YouTubeLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { FACEBOOK_BLUE, YOUTUBE_RED } from '@/theme/brandColors';
import type { KubdeeTheme } from '@/theme/tokens';

const CHANNEL_CARD_WIDTH = 176;
const CHANNEL_CARD_GAP = 8; // ต้องตรงกับ gap-2 ของ contentContainer

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
  const scrollRef = useRef<ScrollView>(null);
  const didAutoScrollRef = useRef(false);

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
      <View className="flex-row items-center gap-2 rounded-kd-lg border border-kd-border bg-kd-input px-3 py-2.5">
        <ActivityIndicator size="small" color={theme.textSubtle} />
        <Text className="text-kd-micro text-kd-text-subtle">กำลังเช็คการเชื่อมต่อ Buffer...</Text>
      </View>
    );
  }

  if (loadState === 'not_connected') {
    return (
      <View className="flex-row items-start gap-2 rounded-kd-lg border border-kd-border bg-kd-input px-3 py-2.5">
        <AlertTriangle size={14} color={theme.amber} strokeWidth={2} />
        <Text className="flex-1 text-kd-micro text-kd-text-subtle">
          ยังไม่ได้เชื่อมต่อ Buffer — ไปเชื่อมต่อที่เว็บ kubdee.ai/settings ก่อน แล้วกลับมาเปิดใช้งานอีกครั้ง
        </Text>
      </View>
    );
  }

  if (loadState === 'no_channels') {
    return (
      <View className="flex-row items-start gap-2 rounded-kd-lg border border-kd-border bg-kd-input px-3 py-2.5">
        <AlertTriangle size={14} color={theme.amber} strokeWidth={2} />
        <Text className="flex-1 text-kd-micro text-kd-text-subtle">
          ยังไม่มี channel {serviceLabel} เชื่อมต่อกับ Buffer อยู่ — ไปเพิ่มที่เว็บ Buffer ก่อน
        </Text>
      </View>
    );
  }

  if (loadState === 'error') {
    return (
      <View className="flex-row items-start gap-2 rounded-kd-lg border border-kd-border bg-kd-input px-3 py-2.5">
        <AlertTriangle size={14} color={theme.red} strokeWidth={2} />
        <Text className="flex-1 text-kd-micro text-kd-text-subtle">เช็คการเชื่อมต่อ Buffer ไม่สำเร็จ ลองอีกครั้ง</Text>
      </View>
    );
  }

  const selectedId = channelId ?? '';

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 pr-1"
      onLayout={() => {
        // เลื่อนไปหา card ที่เลือกไว้เฉพาะครั้งแรกที่ลิสต์โผล่ — ตอนกดเลือกใบที่
        // มองเห็นอยู่แล้วไม่ควรกระตุกลิสต์
        if (didAutoScrollRef.current) return;
        didAutoScrollRef.current = true;
        const index = channels.findIndex((channel) => channel.id === selectedId);
        if (index > 0) {
          // เผื่อขอบซ้ายไว้นิดให้เห็นใบก่อนหน้าโผล่มา จะได้รู้ว่าเลื่อนได้
          const x = Math.max(0, index * (CHANNEL_CARD_WIDTH + CHANNEL_CARD_GAP) - CHANNEL_CARD_GAP * 2);
          scrollRef.current?.scrollTo({ x, animated: false });
        }
      }}
    >
      {channels.map((channel) => {
        const selected = channel.id === selectedId;
        return (
          <Pressable
            key={channel.id}
            accessibilityRole="button"
            onPress={() => (selected ? onClearChannel() : onSelectChannel(channel.id))}
            className="flex-row items-center gap-2 rounded-kd-lg border bg-kd-input p-2"
            style={{ width: CHANNEL_CARD_WIDTH, borderColor: selected ? accent : theme.border }}
          >
            <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-kd-md border border-kd-border bg-kd-panel-muted dark:bg-kd-card-muted">
              {channel.avatar ? (
                <Image source={{ uri: channel.avatar }} className="h-full w-full" resizeMode="cover" />
              ) : (
                renderLogo()
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-kd-caption font-semibold text-kd-text">
                {channel.displayName || channel.name}
              </Text>
              <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
                {channel.isQueuePaused ? 'คิวหยุดชั่วคราว' : serviceLabel}
              </Text>
            </View>
            {selected ? <Check size={16} color={accent} strokeWidth={2.5} /> : null}
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
