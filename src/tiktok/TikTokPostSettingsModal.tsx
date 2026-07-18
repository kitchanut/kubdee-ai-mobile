import { Pressable, Switch, TextInput, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';

import PostSettingsModal from '@/components/post/PostSettingsModal';
import Text from '@/components/ui/KubdeeText';
import type { TikTokPostSettings } from '@/tiktok/tiktokPostSettingsStore';
import {
  TIKTOK_FIRST_POST_OFFSET_OPTIONS,
  TIKTOK_HOUR_OPTIONS,
  TIKTOK_INTERVAL_OPTIONS,
  TIKTOK_MINUTE_OPTIONS,
  TIKTOK_SOUND_TAB_OPTIONS,
  TIKTOK_VARIATION_OPTIONS,
} from '@/tiktok/tiktokPostSettingsStore';
import { alpha } from '@/theme/tokens';
import type { KubdeeTheme } from '@/theme/tokens';

const TIKTOK_PINK = '#fe2c55';

interface TikTokPostSettingsModalProps {
  onChange: <K extends keyof TikTokPostSettings>(key: K, value: TikTokPostSettings[K]) => void;
  onClose: () => void;
  settings: TikTokPostSettings;
  theme: KubdeeTheme;
  visible: boolean;
}

export default function TikTokPostSettingsModal({
  onChange,
  onClose,
  settings,
  theme,
  visible,
}: TikTokPostSettingsModalProps): React.JSX.Element {
  return (
    <PostSettingsModal onClose={onClose} theme={theme} title="ตั้งค่า TikTok Post" visible={visible}>
      <SectionTitle label="การโพสต์" />
      <View className="gap-1.5">
        <Text className="text-kd-caption font-semibold text-kd-text-subtle">รูปแบบการส่ง</Text>
        <View className="flex-row gap-2">
          <SegmentOption
            checked={settings.postAction === 'publish'}
            label="เผยแพร่"
            onPress={() => onChange('postAction', 'publish')}
            theme={theme}
          />
          <SegmentOption
            checked={settings.postAction === 'draft'}
            label="บันทึกร่าง"
            onPress={() => onChange('postAction', 'draft')}
            theme={theme}
          />
        </View>
      </View>

      <ToggleRow
        description="แนบเฉพาะวิดีโอที่ผูกกับสินค้า TikTok และมี Product ID"
        label="แนบสินค้า TikTok"
        onValueChange={(value) => onChange('enableProductLink', value)}
        theme={theme}
        value={settings.enableProductLink}
      />

      <View className="gap-1.5">
        <Text className="text-kd-caption font-semibold text-kd-text-subtle">เวลาโพสต์</Text>
        <View className="flex-row gap-2">
          <SegmentOption
            checked={settings.scheduleMode === 'now'}
            label="ทันที"
            onPress={() => onChange('scheduleMode', 'now')}
            theme={theme}
          />
          <SegmentOption
            checked={settings.scheduleMode === 'schedule'}
            label="ตั้งเวลา"
            onPress={() => onChange('scheduleMode', 'schedule')}
            theme={theme}
          />
        </View>
      </View>

      {settings.scheduleMode === 'schedule' ? (
        <View className="gap-2 rounded-kd-lg border border-kd-border bg-kd-card p-2">
          <ChipRow
            label="ระยะห่างแต่ละคลิป"
            onSelect={(value) => onChange('interval', value)}
            options={TIKTOK_INTERVAL_OPTIONS}
            selected={settings.interval}
            theme={theme}
          />
          <ChipRow
            label="สุ่มเวลา"
            onSelect={(value) => onChange('intervalVariation', value)}
            options={TIKTOK_VARIATION_OPTIONS}
            selected={settings.intervalVariation}
            theme={theme}
          />
          <View className="gap-1.5">
            <Text className="text-kd-caption font-semibold text-kd-text-subtle">เวลาโพสต์แรก</Text>
            <View className="flex-row gap-2">
              <SegmentOption
                checked={settings.firstPostTimeMode === 'offset'}
                label="บวกจากตอนนี้"
                onPress={() => onChange('firstPostTimeMode', 'offset')}
                theme={theme}
              />
              <SegmentOption
                checked={settings.firstPostTimeMode === 'custom'}
                label="เลือกเวลา"
                onPress={() => onChange('firstPostTimeMode', 'custom')}
                theme={theme}
              />
            </View>
          </View>
          {settings.firstPostTimeMode === 'offset' ? (
            <ChipRow
              label="โพสต์แรกหลังจากตอนนี้"
              onSelect={(value) => onChange('firstPostOffset', value)}
              options={TIKTOK_FIRST_POST_OFFSET_OPTIONS}
              selected={settings.firstPostOffset}
              theme={theme}
            />
          ) : (
            <View className="gap-1.5">
              <Text className="text-kd-caption font-semibold text-kd-text-subtle">
                วันที่โพสต์แรก (เว้นว่าง = วันนี้)
              </Text>
              <TextInput
                accessibilityLabel="วันที่โพสต์แรก"
                className="h-10 rounded-kd-lg border border-kd-border bg-kd-panel px-3 text-kd-caption text-kd-text"
                onChangeText={(value) => onChange('firstPostCustomDate', value.trim())}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textSubtle}
                value={settings.firstPostCustomDate}
              />
              <ChipRow
                label="ชั่วโมง"
                onSelect={(value) => onChange('firstPostCustomHour', value)}
                options={TIKTOK_HOUR_OPTIONS.map((hour) => ({ label: hour, value: hour }))}
                selected={settings.firstPostCustomHour}
                theme={theme}
              />
              <ChipRow
                label="นาที"
                onSelect={(value) => onChange('firstPostCustomMinute', value)}
                options={TIKTOK_MINUTE_OPTIONS.map((minute) => ({ label: minute, value: minute }))}
                selected={settings.firstPostCustomMinute}
                theme={theme}
              />
            </View>
          )}
        </View>
      ) : null}

      <SectionTitle label="เนื้อหา (AI)" />
      <ToggleRow
        description="ให้ AI เขียนแคปชั่นใหม่จากชื่อสินค้า/แคปชั่นเดิมก่อนโพสต์"
        label="AI คิด Caption"
        onValueChange={(value) => onChange('aiGenerateCaption', value)}
        theme={theme}
        value={settings.aiGenerateCaption}
      />
      <ToggleRow
        description="ให้ AI คิดแฮชแท็กใหม่ก่อนโพสต์"
        label="AI คิด Hashtags"
        onValueChange={(value) => onChange('aiGenerateHashtags', value)}
        theme={theme}
        value={settings.aiGenerateHashtags}
      />
      {settings.aiGenerateHashtags ? (
        <ChipRow
          label="จำนวนแฮชแท็ก"
          onSelect={(value) => onChange('aiHashtagCount', value)}
          options={[1, 2, 3, 4, 5, 6, 8, 10].map((count) => ({ label: String(count), value: count }))}
          selected={settings.aiHashtagCount}
          theme={theme}
        />
      ) : null}
      <ToggleRow
        description="ให้ AI คิดข้อความชวนซื้อ (CTA) ใหม่ก่อนโพสต์"
        label="AI คิด CTA"
        onValueChange={(value) => onChange('aiGenerateCta', value)}
        theme={theme}
        value={settings.aiGenerateCta}
      />

      <SectionTitle label="เสียง" />
      <ToggleRow
        description="เปิด editor ใส่เพลงประกอบก่อนโพสต์ (ทดลอง — ช้าลงต่อคลิป)"
        label="ใส่เพลงประกอบ"
        onValueChange={(value) => onChange('enableSound', value)}
        theme={theme}
        value={settings.enableSound}
      />
      {settings.enableSound ? (
        <View className="gap-2 rounded-kd-lg border border-kd-border bg-kd-card p-2">
          <ChipRow
            label="Duplicate clip (ต่อคลิปให้ยาวขึ้น)"
            onSelect={(value) => onChange('duplicateClipCount', value)}
            options={[0, 1, 2, 3, 4, 5].map((count) => ({
              label: count === 0 ? 'ปิด' : `${count} ครั้ง`,
              value: count,
            }))}
            selected={settings.duplicateClipCount}
            theme={theme}
          />
          <View className="gap-1.5">
            <Text className="text-kd-caption font-semibold text-kd-text-subtle">วิธีเลือกเพลง</Text>
            <View className="flex-row gap-2">
              <SegmentOption
                checked={settings.soundMode === 'tab'}
                label="เลือกจาก Tab"
                onPress={() => onChange('soundMode', 'tab')}
                theme={theme}
              />
              <SegmentOption
                checked={settings.soundMode === 'search'}
                label="ค้นหาเพลง"
                onPress={() => onChange('soundMode', 'search')}
                theme={theme}
              />
            </View>
          </View>
          {settings.soundMode === 'tab' ? (
            <ChipRow
              label="Sound Tab"
              onSelect={(value) => onChange('soundTab', value)}
              options={TIKTOK_SOUND_TAB_OPTIONS}
              selected={settings.soundTab}
              theme={theme}
            />
          ) : (
            <View className="gap-1.5">
              <Text className="text-kd-caption font-semibold text-kd-text-subtle">
                รายชื่อเพลง (บรรทัดละเพลง)
              </Text>
              <TextInput
                accessibilityLabel="รายชื่อเพลงที่จะค้นหา"
                className="min-h-20 rounded-kd-lg border border-kd-border bg-kd-panel px-3 py-2 text-kd-caption text-kd-text"
                multiline
                onChangeText={(value) => onChange('soundSearchList', value.split('\n'))}
                placeholder={'พิมพ์ชื่อเพลง...\nเพลงที่สอง...'}
                placeholderTextColor={theme.textSubtle}
                textAlignVertical="top"
                value={settings.soundSearchList.join('\n')}
              />
              <View className="flex-row gap-2">
                <SegmentOption
                  checked={settings.soundSearchOrder === 'sequential'}
                  label="เรียงลำดับ"
                  onPress={() => onChange('soundSearchOrder', 'sequential')}
                  theme={theme}
                />
                <SegmentOption
                  checked={settings.soundSearchOrder === 'random'}
                  label="สุ่ม"
                  onPress={() => onChange('soundSearchOrder', 'random')}
                  theme={theme}
                />
              </View>
            </View>
          )}
          <ChipRow
            label="ลำดับเพลงในผลลัพธ์"
            onSelect={(value) => onChange('soundIndex', value)}
            options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((index) => ({
              label: index === 0 ? 'สุ่ม' : String(index),
              value: index,
            }))}
            selected={settings.soundIndex}
            theme={theme}
          />
          <StepperRow
            label="เสียงคลิป"
            onValueChange={(value) => onChange('soundVideoVolume', value)}
            theme={theme}
            value={settings.soundVideoVolume}
          />
          <StepperRow
            label="เสียงเพลง"
            onValueChange={(value) => onChange('soundMusicVolume', value)}
            theme={theme}
            value={settings.soundMusicVolume}
          />
        </View>
      ) : null}
    </PostSettingsModal>
  );
}

function SectionTitle({ label }: { label: string }): React.JSX.Element {
  return (
    <Text className="mt-1 text-kd-caption font-bold uppercase text-kd-text-muted">{label}</Text>
  );
}

function SegmentOption({
  checked,
  label,
  onPress,
  theme,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      onPress={onPress}
      className="h-11 flex-1 items-center justify-center rounded-kd-lg border active:opacity-75"
      style={{
        backgroundColor: checked ? alpha(TIKTOK_PINK, theme.isDark ? 0.12 : 0.07) : theme.card,
        borderColor: checked ? TIKTOK_PINK : theme.border,
      }}
    >
      <Text className="text-kd-caption font-semibold" style={{ color: checked ? TIKTOK_PINK : theme.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

function ToggleRow({
  description,
  label,
  onValueChange,
  theme,
  value,
}: {
  description: string;
  label: string;
  onValueChange: (value: boolean) => void;
  theme: KubdeeTheme;
  value: boolean;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-3 py-1">
      <View className="min-w-0 flex-1">
        <Text className="text-kd-body font-semibold text-kd-text">{label}</Text>
        <Text className="mt-0.5 text-kd-micro text-kd-text-subtle">{description}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityRole="switch"
        onValueChange={onValueChange}
        thumbColor={value ? TIKTOK_PINK : theme.textSubtle}
        trackColor={{ false: theme.border, true: alpha(TIKTOK_PINK, 0.55) }}
        value={value}
      />
    </View>
  );
}

function ChipRow<T extends string | number>({
  label,
  onSelect,
  options,
  selected,
  theme,
}: {
  label: string;
  onSelect: (value: T) => void;
  options: { label: string; value: T }[];
  selected: T;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View className="gap-1.5">
      <Text className="text-kd-caption font-semibold text-kd-text-subtle">{label}</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {options.map((option) => {
          const checked = option.value === selected;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              key={String(option.value)}
              onPress={() => onSelect(option.value)}
              className="h-8 items-center justify-center rounded-kd-md border px-2.5 active:opacity-75"
              style={{
                backgroundColor: checked ? alpha(TIKTOK_PINK, theme.isDark ? 0.12 : 0.07) : theme.card,
                borderColor: checked ? TIKTOK_PINK : theme.border,
              }}
            >
              <Text
                className="text-kd-micro font-semibold"
                style={{ color: checked ? TIKTOK_PINK : theme.text }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function StepperRow({
  label,
  onValueChange,
  theme,
  value,
}: {
  label: string;
  onValueChange: (value: number) => void;
  theme: KubdeeTheme;
  value: number;
}): React.JSX.Element {
  const step = 5;
  const clamp = (next: number): number => Math.min(20, Math.max(-60, next));
  return (
    <View className="flex-row items-center gap-3 py-0.5">
      <Text className="min-w-0 flex-1 text-kd-caption font-semibold text-kd-text-subtle">
        {label} ({value} dB)
      </Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityLabel={`ลด${label}`}
          accessibilityRole="button"
          onPress={() => onValueChange(clamp(value - step))}
          className="h-8 w-8 items-center justify-center rounded-kd-md border border-kd-border bg-kd-card active:opacity-70"
        >
          <Minus size={14} color={theme.text} strokeWidth={2.4} />
        </Pressable>
        <Text className="w-10 text-center text-kd-caption font-semibold text-kd-text">{value}</Text>
        <Pressable
          accessibilityLabel={`เพิ่ม${label}`}
          accessibilityRole="button"
          onPress={() => onValueChange(clamp(value + step))}
          className="h-8 w-8 items-center justify-center rounded-kd-md border border-kd-border bg-kd-card active:opacity-70"
        >
          <Plus size={14} color={theme.text} strokeWidth={2.4} />
        </Pressable>
      </View>
    </View>
  );
}
