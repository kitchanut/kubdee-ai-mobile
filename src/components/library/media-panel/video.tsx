import { Image as NativeImage, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Play, Video } from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import type { MediaSubItem } from './types';

export function LocalVideoPlaceholder({
  theme,
  compact = false,
  thumbnailUri,
}: {
  theme: KubdeeTheme;
  compact?: boolean;
  thumbnailUri?: string | null;
}): React.JSX.Element {
  return (
    <View className="h-full w-full items-center justify-center bg-kd-border dark:bg-kd-card-muted">
      {thumbnailUri ? (
        <NativeImage source={{ uri: thumbnailUri }} className="h-full w-full" resizeMode="cover" />
      ) : (
        <Video size={compact ? 18 : 28} color={theme.textSubtle} strokeWidth={1.5} />
      )}
      <View className="absolute inset-0 bg-black/10" />
      <View
        className={`absolute items-center justify-center rounded-full bg-black/35 ${
          compact ? 'h-7 w-7' : 'h-11 w-11'
        }`}
      >
        <Play size={compact ? 14 : 20} color={theme.white} strokeWidth={2.2} />
      </View>
    </View>
  );
}

export function LocalVideoPlayer({
  media,
  theme,
}: {
  media: MediaSubItem;
  theme: KubdeeTheme;
}): React.JSX.Element {
  const player = useVideoPlayer(
    media.uri ? { uri: media.uri, metadata: { title: media.title, artist: media.productName } } : null,
    (nextPlayer) => {
      nextPlayer.loop = false;
      nextPlayer.muted = false;
      nextPlayer.play();
    }
  );
  if (!media.uri) {
    return (
      <View className="items-center gap-2">
        <Video size={36} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />
        <Text className="text-kd-caption text-white/60">ไม่พบไฟล์วิดีโอ</Text>
      </View>
    );
  }

  return (
    <View className="w-full overflow-hidden rounded-[18px] bg-black" style={{ aspectRatio: media.portrait ? 9 / 16 : 16 / 9 }}>
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        useExoShutter={false}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
