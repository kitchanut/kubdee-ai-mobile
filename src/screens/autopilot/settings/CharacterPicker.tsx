import { View } from 'react-native';
import { ImagePlus, Users } from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import {
  IMAGE_CHARACTER_MODE_TABS,
  IMAGE_SCENE_MODE_TABS,
  type AutoPilotOption,
} from '@/autopilot/optionSets';

import { OptionGroup, SettingInput } from '../primitives';

/**
 * MediaModePicker — ใช้ร่วมกันสำหรับ "ตัวละคร" และ "ฉาก"
 * 5 โหมด: auto | gallery | upload | description | none
 * - description = textarea (wired)
 * - gallery/upload = UI shell (empty-state / dashed button) รอ wire ข้อมูลจริง
 */
function MediaModePicker({
  tabs,
  mode,
  onModeChange,
  description,
  onDescriptionChange,
  descriptionLabel,
  descriptionPlaceholder,
  galleryEmptyText,
  theme,
  accent,
}: {
  tabs: AutoPilotOption[];
  mode: string;
  onModeChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  galleryEmptyText: string;
  theme: KubdeeTheme;
  accent: string;
}): React.JSX.Element {
  return (
    <View className="gap-2">
      <OptionGroup
        columns={5}
        compact
        options={tabs.map((tab) => ({ label: tab.label, value: tab.value }))}
        theme={theme}
        accent={accent}
        value={mode}
        onChange={(value) => onModeChange(String(value))}
      />

      {mode === 'gallery' ? (
        <View className="items-center justify-center rounded-kd-lg border border-dashed border-kd-border bg-kd-panel-muted px-3 py-5 dark:bg-kd-card-muted">
          <Users size={18} color={theme.textSubtle} strokeWidth={1.8} />
          <Text className="mt-1 text-kd-micro text-kd-text-subtle">{galleryEmptyText}</Text>
        </View>
      ) : null}

      {mode === 'upload' ? (
        <View
          className="flex-row items-center justify-center gap-1.5 rounded-kd-lg border border-dashed border-kd-border px-3 py-5"
          style={{ opacity: 0.6 }}
        >
          <ImagePlus size={18} color={theme.textSubtle} strokeWidth={1.8} />
          <Text className="text-kd-micro text-kd-text-subtle">อัปโหลดรูป (เร็ว ๆ นี้)</Text>
        </View>
      ) : null}

      {mode === 'description' ? (
        <SettingInput
          multiline
          label={descriptionLabel}
          placeholder={descriptionPlaceholder}
          theme={theme}
          value={description}
          onChangeText={onDescriptionChange}
        />
      ) : null}
    </View>
  );
}

export function CharacterPicker({
  mode,
  onModeChange,
  description,
  onDescriptionChange,
  theme,
  accent,
}: {
  mode: string;
  onModeChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  theme: KubdeeTheme;
  accent: string;
}): React.JSX.Element {
  return (
    <MediaModePicker
      tabs={IMAGE_CHARACTER_MODE_TABS}
      mode={mode}
      onModeChange={onModeChange}
      description={description}
      onDescriptionChange={onDescriptionChange}
      descriptionLabel="อธิบายตัวละคร"
      descriptionPlaceholder="เช่น ผู้หญิงผมยาวสีดำ ใส่เสื้อสูท..."
      galleryEmptyText="ยังไม่มีตัวละครในคลัง"
      theme={theme}
      accent={accent}
    />
  );
}

export function ScenePicker({
  mode,
  onModeChange,
  description,
  onDescriptionChange,
  theme,
  accent,
}: {
  mode: string;
  onModeChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  theme: KubdeeTheme;
  accent: string;
}): React.JSX.Element {
  return (
    <MediaModePicker
      tabs={IMAGE_SCENE_MODE_TABS}
      mode={mode}
      onModeChange={onModeChange}
      description={description}
      onDescriptionChange={onDescriptionChange}
      descriptionLabel="อธิบายฉาก"
      descriptionPlaceholder="เช่น ห้องนั่งเล่นสว่าง โต๊ะไม้ โทนอบอุ่น"
      galleryEmptyText="ยังไม่มีฉากในคลัง"
      theme={theme}
      accent={accent}
    />
  );
}
