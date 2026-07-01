import { Image as NativeImage, Pressable, TextInput, View } from 'react-native';
import { Check, Link2, ShoppingBag } from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';

export function LabeledTextInput({
  label,
  value,
  placeholder,
  multiline = false,
  theme,
  onChangeText,
}: {
  label: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  theme: KubdeeTheme;
  onChangeText: (value: string) => void;
}): React.JSX.Element {
  return (
    <View className="gap-1">
      <Text className="text-kd-caption font-medium text-kd-text-subtle">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        className={`rounded-kd-lg border border-kd-border bg-kd-input px-3 text-kd-body text-kd-text ${
          multiline ? 'min-h-[76px] py-2' : 'h-11'
        }`}
      />
    </View>
  );
}

export function UploadDraftInput({
  value,
  placeholder,
  editable,
  last = false,
  mono = false,
  multiline = false,
  theme,
  onChangeText,
}: {
  value: string;
  placeholder: string;
  editable: boolean;
  last?: boolean;
  mono?: boolean;
  multiline?: boolean;
  theme: KubdeeTheme;
  onChangeText: (value: string) => void;
}): React.JSX.Element {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.textMuted}
      editable={editable}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      className={`${multiline ? 'min-h-[58px] py-2' : 'h-10'} w-full bg-transparent px-3 text-kd-body text-kd-text ${mono ? 'font-mono' : ''} ${last ? '' : 'border-b border-kd-border'}`}
    />
  );
}

export function ProductPickerRow({
  active,
  imageUri,
  meta,
  name,
  theme,
  onPress,
}: {
  active: boolean;
  imageUri: string | null;
  meta: string;
  name: string;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`flex-row items-center gap-2 rounded-kd-lg border p-2 active:opacity-75 ${
        active ? 'border-kd-red bg-kd-red-soft' : 'border-kd-border bg-kd-card'
      }`}
    >
      <View className="h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-kd-md bg-kd-panel">
        {imageUri ? (
          <NativeImage source={{ uri: imageUri }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <ShoppingBag size={19} color={theme.textSubtle} strokeWidth={1.7} />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
          {name}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-1">
          {meta.includes('ลิงก์') ? <Link2 size={10} color={theme.orange} strokeWidth={2} /> : null}
          <Text numberOfLines={1} className="min-w-0 flex-1 text-kd-caption text-kd-text-subtle">
            {meta}
          </Text>
        </View>
      </View>
      {active ? (
        <View className="h-5 w-5 items-center justify-center rounded-full bg-kd-red">
          <Check size={12} color={theme.white} strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Extension grouped view: rounded-xl card, soft tone header row
 * (chevron circle + 36px product thumb + name / #id + count), media inside
 */
