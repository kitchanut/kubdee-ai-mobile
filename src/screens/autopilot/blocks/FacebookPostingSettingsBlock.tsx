import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { AlertTriangle, Check } from 'lucide-react-native';
import { getBufferConnectionStatus, listFacebookBufferChannels } from '@/autopilot/bufferPosting';
import type { BufferChannel } from '@/autopilot/bufferPosting';
import { FacebookLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';

const FACEBOOK_BLUE = '#0866FF';
const CHANNEL_CARD_WIDTH = 176;
const CHANNEL_CARD_GAP = 8; // ต้องตรงกับ gap-2 ของ contentContainer

type LoadState = 'loading' | 'not_connected' | 'no_channels' | 'ready' | 'error';

// Facebook posting goes through Buffer, and Buffer connection (entering the
// API key) only happens on the web (kubdee.ai/settings) by design — mobile
// only reads the connection status + channel list, it never lets the user
// paste a key here.
export function FacebookPostingSettingsBlock({
  facebookChannelId,
  theme,
  onSelectChannel,
}: {
  facebookChannelId: string | null;
  theme: KubdeeTheme;
  onSelectChannel: (channelId: string) => void;
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

        const facebookChannels = await listFacebookBufferChannels();
        if (cancelled) return;
        setChannels(facebookChannels);
        setLoadState(facebookChannels.length > 0 ? 'ready' : 'no_channels');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loadState !== 'ready' || channels.length === 0) return;
    // Also re-select if the persisted channel no longer exists (e.g. it was
    // removed/disconnected on Buffer's side since it was last picked) —
    // otherwise a stale id would silently fail every post instead of falling
    // back to a channel that's actually still connected.
    const stillExists = facebookChannelId && channels.some((channel) => channel.id === facebookChannelId);
    if (!stillExists) {
      onSelectChannel(channels[0].id);
    }
  }, [loadState, facebookChannelId, channels, onSelectChannel]);

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
          ยังไม่มี channel Facebook เชื่อมต่อกับ Buffer อยู่ — ไปเพิ่มที่เว็บ Buffer ก่อน
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

  const selectedId = facebookChannelId ?? channels[0]?.id ?? '';

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
            onPress={() => onSelectChannel(channel.id)}
            className="flex-row items-center gap-2 rounded-kd-lg border bg-kd-input p-2"
            style={{ width: CHANNEL_CARD_WIDTH, borderColor: selected ? FACEBOOK_BLUE : theme.border }}
          >
            <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-kd-md border border-kd-border bg-kd-panel-muted dark:bg-kd-card-muted">
              {channel.avatar ? (
                <Image source={{ uri: channel.avatar }} className="h-full w-full" resizeMode="cover" />
              ) : (
                <FacebookLogo size={20} color={FACEBOOK_BLUE} cutoutColor={theme.input} />
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-kd-caption font-semibold text-kd-text">
                {channel.displayName || channel.name}
              </Text>
              <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
                {channel.isQueuePaused ? 'คิวหยุดชั่วคราว' : 'Facebook'}
              </Text>
            </View>
            {selected ? <Check size={16} color={FACEBOOK_BLUE} strokeWidth={2.5} /> : null}
          </Pressable>
        );
      })}
  </ScrollView>
  );
}
