import { useMemo } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Check, ImagePlus, Presentation, Users } from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import type { CreativeAssetKind, CreativeLibraryItem } from '@/library/CreativeLibraryContext';
import { useCreativeLibrary } from '@/library/CreativeLibraryContext';
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
 * - gallery = เลือก item จากคลัง local
 * - upload = ใส่ลิงก์รูป reference เองสำหรับแนบไป Flow
 */
function MediaModePicker({
  kind,
  tabs,
  mode,
  onModeChange,
  selectedItemId,
  uploadUri,
  libraryItems,
  onSelectItem,
  onUploadUriChange,
  description,
  onDescriptionChange,
  descriptionLabel,
  descriptionPlaceholder,
  galleryEmptyText,
  theme,
  accent,
}: {
  kind: CreativeAssetKind;
  tabs: AutoPilotOption[];
  mode: string;
  onModeChange: (value: string) => void;
  selectedItemId: string | null;
  uploadUri: string | null;
  libraryItems: CreativeLibraryItem[];
  onSelectItem: (item: CreativeLibraryItem) => void;
  onUploadUriChange: (value: string) => void;
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
        <View className="gap-2">
          {libraryItems.length > 0 ? (
            libraryItems.map((item) => (
              <LibraryReferenceRow
                key={item.id}
                item={item}
                kind={kind}
                selected={item.id === selectedItemId}
                theme={theme}
                accent={accent}
                onPress={() => onSelectItem(item)}
              />
            ))
          ) : (
            <View className="items-center justify-center rounded-kd-lg border border-dashed border-kd-border bg-kd-panel-muted px-3 py-5 dark:bg-kd-card-muted">
              {kind === 'characters' ? (
                <Users size={18} color={theme.textSubtle} strokeWidth={1.8} />
              ) : (
                <Presentation size={18} color={theme.textSubtle} strokeWidth={1.8} />
              )}
              <Text className="mt-1 text-kd-micro text-kd-text-subtle">{galleryEmptyText}</Text>
            </View>
          )}
        </View>
      ) : null}

      {mode === 'upload' ? (
        <View className="gap-2">
          <SettingInput
            label="ลิงก์รูป reference"
            placeholder="https://..."
            theme={theme}
            value={uploadUri ?? ''}
            onChangeText={onUploadUriChange}
          />
          {uploadUri ? (
            <View className="h-28 overflow-hidden rounded-kd-lg border border-kd-border bg-kd-panel-muted dark:bg-kd-card-muted">
              <Image source={{ uri: uploadUri }} className="h-full w-full" resizeMode="cover" />
            </View>
          ) : (
            <View className="flex-row items-center justify-center gap-1.5 rounded-kd-lg border border-dashed border-kd-border px-3 py-4">
              <ImagePlus size={18} color={theme.textSubtle} strokeWidth={1.8} />
              <Text className="text-kd-micro text-kd-text-subtle">ใส่ลิงก์รูปเพื่อใช้เป็น reference</Text>
            </View>
          )}
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

function LibraryReferenceRow({
  item,
  kind,
  selected,
  theme,
  accent,
  onPress,
}: {
  item: CreativeLibraryItem;
  kind: CreativeAssetKind;
  selected: boolean;
  theme: KubdeeTheme;
  accent: string;
  onPress: () => void;
}): React.JSX.Element {
  const Icon = kind === 'characters' ? Users : Presentation;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-2 rounded-kd-lg border bg-kd-input p-2"
      style={{
        borderColor: selected ? accent : theme.border,
      }}
    >
      <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-kd-md border border-kd-border bg-kd-panel-muted dark:bg-kd-card-muted">
        {item.imageUri ? (
          <Image source={{ uri: item.imageUri }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <Icon size={18} color={theme.textSubtle} strokeWidth={1.8} />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-kd-caption font-semibold text-kd-text">
          {item.name}
        </Text>
        <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
          {item.description || (item.imageUri ? 'มีรูป reference' : 'ยังไม่มีรายละเอียด')}
        </Text>
      </View>
      {selected ? <Check size={16} color={accent} strokeWidth={2.5} /> : null}
    </Pressable>
  );
}

export function CharacterPicker({
  mode,
  onModeChange,
  profileLocalId,
  selectedItemId,
  uploadUri,
  onSelectItem,
  onUploadUriChange,
  description,
  onDescriptionChange,
  theme,
  accent,
}: {
  mode: string;
  onModeChange: (value: string) => void;
  profileLocalId: string;
  selectedItemId: string | null;
  uploadUri: string | null;
  onSelectItem: (item: CreativeLibraryItem) => void;
  onUploadUriChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  theme: KubdeeTheme;
  accent: string;
}): React.JSX.Element {
  const { getLibraryItems } = useCreativeLibrary();
  const items = useMemo(
    () => getLibraryItems('characters', profileLocalId).filter((item) => item.enabled),
    [getLibraryItems, profileLocalId]
  );

  return (
    <MediaModePicker
      kind="characters"
      tabs={IMAGE_CHARACTER_MODE_TABS}
      mode={mode}
      onModeChange={onModeChange}
      selectedItemId={selectedItemId}
      uploadUri={uploadUri}
      libraryItems={items}
      onSelectItem={onSelectItem}
      onUploadUriChange={onUploadUriChange}
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
  profileLocalId,
  selectedItemId,
  uploadUri,
  onSelectItem,
  onUploadUriChange,
  description,
  onDescriptionChange,
  theme,
  accent,
}: {
  mode: string;
  onModeChange: (value: string) => void;
  profileLocalId: string;
  selectedItemId: string | null;
  uploadUri: string | null;
  onSelectItem: (item: CreativeLibraryItem) => void;
  onUploadUriChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  theme: KubdeeTheme;
  accent: string;
}): React.JSX.Element {
  const { getLibraryItems } = useCreativeLibrary();
  const items = useMemo(
    () => getLibraryItems('scenes', profileLocalId).filter((item) => item.enabled),
    [getLibraryItems, profileLocalId]
  );

  return (
    <MediaModePicker
      kind="scenes"
      tabs={IMAGE_SCENE_MODE_TABS}
      mode={mode}
      onModeChange={onModeChange}
      selectedItemId={selectedItemId}
      uploadUri={uploadUri}
      libraryItems={items}
      onSelectItem={onSelectItem}
      onUploadUriChange={onUploadUriChange}
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
