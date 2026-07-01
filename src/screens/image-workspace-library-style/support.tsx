import { Image, Pressable, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as FileSystem from 'expo-file-system/legacy';
import { BriefcaseBusiness, ChevronDown, Image as ImageIcon, ImagePlus, Smile, User, Users, X } from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import type { CharacterReferenceLayout, CreativeImageKind } from '@/creative/creativeImageRunner';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';
import { getAccentTone } from '@/components/library/shared';

export type DraftItem = {
  id: string;
  name: string;
  description: string;
  referenceUri: string | null;
};

export type ControlMap = Partial<Record<string, string>>;
export type SelectOption = {
  label: string;
  value: string;
};
export type CharacterPresetTabKey = 'ไม่มี' | 'ทั่วไป' | 'ไลฟ์สไตล์' | 'อาชีพ' | 'ครอบครัว';
export type CharacterPresetItem = {
  value: string;
  label: string;
  style?: string;
  clothing?: string;
  prompt: string;
};

export const MODE_TABS: Array<{ key: CreativeImageKind; label: string }> = [
  { key: 'characters', label: 'สร้างตัวละคร' },
  { key: 'scenes', label: 'สร้างฉาก' },
];

export const ASPECT_OPTIONS = [
  { value: '9:16', label: 'แนวตั้ง (9:16)' },
  { value: '16:9', label: 'แนวนอน (16:9)' },
] as const;

export const COUNT_OPTIONS = ['1', '2', '3', '4'] as const;
export const CHARACTER_REFERENCE_LAYOUT_OPTIONS: Array<{
  value: CharacterReferenceLayout;
  label: string;
  description: string;
}> = [
  {
    value: 'single',
    label: 'ภาพเดียว',
    description: 'ใช้เร็ว เหมาะกับตัวละคร reference ปกติ',
  },
  {
    value: 'grid3x3',
    label: 'ชีท 3x3',
    description: 'หลายมุม หลายสีหน้า ช่วยให้ตัวละครนิ่งขึ้น',
  },
];
export const CHARACTER_PRESET_TABS: CharacterPresetTabKey[] = ['ไม่มี', 'ทั่วไป', 'ไลฟ์สไตล์', 'อาชีพ', 'ครอบครัว'];
export const CHARACTER_PRESET_ITEMS: Record<CharacterPresetTabKey, CharacterPresetItem[]> = {
  ไม่มี: [],
  ทั่วไป: [
    {
      value: 'young_adult',
      label: 'วัยทำงาน',
      style: 'Smart Casual',
      prompt:
        'a confident young adult professional, smart casual attire, professional yet approachable, natural radiant look, standing straight, front view, looking at camera, empty hands, arms by side, studio lighting, isolated on white background, advertising photography style',
    },
    {
      value: 'student',
      label: 'นักศึกษา',
      clothing: 'ชุดนักศึกษา',
      prompt:
        'a university student, wearing a neat uniform, fresh and bright look, friendly smile, standing straight, front view, looking at camera, empty hands, soft natural lighting, isolated on white background, educational concept',
    },
    {
      value: 'teenager',
      label: 'วัยรุ่น',
      style: 'สตรีท/สดใส',
      prompt:
        'a cheerful teenager, trendy casual outfit, energetic and fresh look, bright smile, standing pose, front view, empty hands, isolated on white background, youth marketing style',
    },
    {
      value: 'kid',
      label: 'เด็กน้อย',
      style: 'น่ารักสดใส',
      prompt:
        'a cute happy child, playful expression, wearing colorful casual clothes, standing straight, front view, looking at camera, empty hands, bright soft lighting, isolated on white background, kids product advertising',
    },
  ],
  ไลฟ์สไตล์: [
    {
      value: 'influencer',
      label: 'อินฟลูฯ',
      style: 'นำสมัย',
      prompt:
        'a trendy lifestyle influencer, glowing skin, stylish outfit, photogenic, engaging smile, standing straight, front view, empty hands, isolated on white background, studio lighting, social media aesthetic',
    },
    {
      value: 'beauty_lover',
      label: 'บิวตี้',
      style: 'หรูหรา',
      prompt:
        'a beauty enthusiast with perfect glass skin, closeup beauty shot, applying skincare or makeup concept, face forward, looking at camera, soft studio lighting, isolated on white background, cosmetic advertisement',
    },
    {
      value: 'gamer',
      label: 'เกมเมอร์',
      style: 'สตรีมอีสปอร์ต',
      prompt:
        'a gamer or streamer, wearing gaming headset, exciting expression, standing straight, front view, looking at camera, empty hands, RGB lighting effects, isolated on white background, tech and gadget style',
    },
    {
      value: 'foodie',
      label: 'สายกิน',
      style: 'เป็นกันเอง',
      prompt:
        'a happy person enjoying food atmosphere, yummy expression, standing straight, front view, looking at camera, empty hands, restaurant lighting, isolated on white background, food blogger style',
    },
    {
      value: 'fitness',
      label: 'สุขภาพ',
      style: 'สปอร์ต',
      prompt:
        'a fit person in activewear, healthy skin, toning body, energetic vibe, standing straight, front view, empty hands, dynamic lighting, isolated on white background, sports advertising style',
    },
    {
      value: 'traveler',
      label: 'นักเดินทาง',
      style: 'ทะมัดทะแมง',
      prompt:
        'a traveler, wearing comfortable travel outfit, adventurous spirit, standing straight, front view, looking at camera, empty hands, natural sunlight, isolated on white background, travel advertisement',
    },
    {
      value: 'minimal',
      label: 'มินิมอล',
      style: 'มินิมอล/เอิร์ธโทน',
      prompt:
        'a person with minimalist style, wearing earth tone linen clothes, natural look, standing straight, front view, empty hands, soft window light, isolated on white background, lifestyle magazine style',
    },
    {
      value: 'street',
      label: 'สตรีท',
      style: 'สตรีท',
      prompt:
        'a cool street-style person, wearing trendy streetwear, oversized tee, sneakers, confident urban look, standing straight, front view, empty hands, isolated on white background, studio lighting, vivid colors',
    },
  ],
  อาชีพ: [
    {
      value: 'business_owner',
      label: 'เจ้าของธุรกิจ',
      style: 'ภูมิฐาน',
      prompt:
        'a successful business owner, wearing a suit or executive attire, confident posture, standing straight, front view, looking at camera, empty hands, arms by side, reliable image, isolated on white background, professional headshot',
    },
    {
      value: 'office_worker',
      label: 'พนักงาน',
      style: 'ทางการ/ยูนิฟอร์ม',
      prompt:
        'a professional office worker, wearing formal shirt or company uniform, ready to work attitude, standing straight, front view, empty hands, isolated on white background, corporate advertising style',
    },
    {
      value: 'online_seller',
      label: 'ขายออนไลน์',
      style: 'เป็นกันเอง',
      prompt:
        'an energetic online seller, wearing an apron or casual brand shirt, friendly and ready to service, standing straight, front view, looking at camera, empty hands, isolated on white background, commercial e-commerce style',
    },
    {
      value: 'creative',
      label: 'ครีเอทีฟ',
      style: 'อาร์ต',
      prompt:
        'a creative freelancer, wearing glasses and casual stylish clothes, standing straight, front view, looking at camera, empty hands, modern tech vibe, isolated on white background, studio portrait',
    },
    {
      value: 'chef',
      label: 'เชฟ',
      clothing: 'ชุดเชฟ',
      prompt:
        'a professional chef, wearing white chef jacket and hat, confident smile, standing straight, front view, looking at camera, empty hands, culinary expert image, isolated on white background',
    },
    {
      value: 'engineer',
      label: 'ช่าง/วิศวะ',
      clothing: 'ชุดช่าง/หมวกเซฟตี้',
      prompt:
        'a professional engineer or technician, wearing safety helmet and reflective vest or workwear, standing straight, front view, looking at camera, empty hands, isolated on white background',
    },
    {
      value: 'doctor',
      label: 'แพทย์',
      clothing: 'เสื้อกาวน์',
      prompt:
        'a professional doctor or specialist, wearing a white coat, clean and hygienic look, reassuring smile, standing straight, front view, empty hands, bright and clean lighting, isolated on white background',
    },
    {
      value: 'rider',
      label: 'ไรเดอร์',
      clothing: 'แจ็คเก็ตไรเดอร์',
      prompt:
        'a friendly delivery rider, wearing rider jacket and helmet, ready to service, standing straight, front view, looking at camera, empty hands, isolated on white background, quick service concept',
    },
  ],
  ครอบครัว: [
    {
      value: 'modern_parent',
      label: 'พ่อ/แม่ยุคใหม่',
      style: 'อบอุ่น',
      prompt:
        'a modern parent, caring concern look, comfortable stylish home wear, warm and loving atmosphere, standing pose, front view, looking at camera, empty hands, soft focus, isolated on white background',
    },
    {
      value: 'senior_happy',
      label: 'ผู้สูงวัย',
      style: 'สดใส',
      prompt:
        'a happy and healthy senior citizen, silver hair, smiling, wellness and longevity concept, standing straight, front view, empty hands, isolated on white background',
    },
  ],
};
export const CHARACTER_TYPE_OPTIONS = ['คนจริง (เหมือนจริง)', 'การ์ตูน 3D', 'อนิเมะ', 'ภาพวาด', 'มาสคอต'];
export const GENDER_OPTIONS = ['ไม่ระบุ', 'หญิง', 'ชาย', 'ไม่จำกัด'];
export const AGE_OPTIONS = ['ไม่ระบุ', 'วัยรุ่น', 'วัยทำงาน', 'ผู้ใหญ่', 'สูงวัย'];
export const ETHNICITY_OPTIONS = ['คนไทย', 'เอเชีย', 'ตะวันตก', 'ไม่ระบุ'];
export const SKIN_TONE_OPTIONS = ['ไม่ระบุ', 'ขาว', 'สองสี', 'แทน', 'เข้ม'];
export const EXPRESSION_OPTIONS = ['ไม่ระบุ', 'ยิ้ม', 'มั่นใจ', 'สดใส', 'จริงจัง'];
export const OUTFIT_OPTIONS = ['ไม่ระบุ', 'ลำลอง', 'ทำงาน', 'พรีเมียม', 'กีฬา', 'แฟชั่น'];
export const POSE_OPTIONS = ['ไม่ระบุ', 'ยืน', 'นั่ง', 'ถือสินค้า', 'ชี้สินค้า', 'ใช้งานสินค้า'];
export const SCENE_TYPES = ['ออโต้', 'สตูดิโอ', 'บ้าน/ห้องจริง', 'ร้านค้า', 'โกดัง', 'โรงงาน', 'คาเฟ่', 'กลางแจ้ง'];
export const SCENE_MOODS = ['ออโต้', 'อบอุ่น', 'มืออาชีพ', 'พรีเมียม', 'มินิมอล', 'สดใส', 'cinematic'];
export const SCENE_LIGHTS = ['ออโต้', 'ธรรมชาติ', 'สตูดิโอ', 'แสงทอง', 'นีออน', 'ร้านค้า'];
export const SCENE_CAMERAS = ['ออโต้', 'ระดับสายตา', 'โคลสอัพ', 'มุมกว้าง', 'มุมสูง'];

export function getPickedImageExtension(uri: string, fileName?: string | null): string {
  const source = fileName || uri.split('?')[0]?.split('/').pop() || '';
  const match = source.match(/\.([a-z0-9]{2,5})$/i);
  const ext = match?.[1]?.toLowerCase();
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
}

export async function copyPickedReferenceImageToLibrary(
  uri: string,
  kind: CreativeImageKind,
  fileName?: string | null
): Promise<string> {
  if (!FileSystem.documentDirectory) {
    throw new Error('ไม่พบพื้นที่จัดเก็บของแอป');
  }

  const directory = `${FileSystem.documentDirectory}creative-reference/${kind}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  const extension = getPickedImageExtension(uri, fileName);
  const targetUri = `${directory}${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  await FileSystem.copyAsync({ from: uri, to: targetUri });
  return targetUri;
}

export function createDraft(kind: CreativeImageKind, index: number): DraftItem {
  return {
    id: `${kind}-${Date.now()}-${index}`,
    name: '',
    description: '',
    referenceUri: null,
  };
}

export function modeLabel(kind: CreativeImageKind): string {
  return kind === 'characters' ? 'ตัวละคร' : 'ฉาก';
}

export function toOptions(options: readonly string[]): SelectOption[] {
  return options.map((option) => ({ label: option, value: option }));
}

export function buildControlSummary(kind: CreativeImageKind, controls: ControlMap): string {
  if (kind === 'characters') {
    return [
      `ประเภทตัวละคร: ${controls.characterType}`,
      `รูปแบบรูปตัวละคร: ${controls.characterReferenceLayout}`,
      `คาแรกเตอร์: ${controls.characterPreset}`,
      controls.characterPresetItem ? `คาแรกเตอร์ย่อย: ${controls.characterPresetItem}` : '',
      `เพศ: ${controls.gender}`,
      `ช่วงอายุ: ${controls.age}`,
      `เชื้อชาติ: ${controls.ethnicity}`,
      `สีผิว: ${controls.skinTone}`,
      `การแสดงออก: ${controls.expression}`,
      `การแต่งกาย: ${controls.outfit}`,
      `ท่าทาง: ${controls.pose}`,
      controls.characterPresetPrompt ? `Preset prompt: ${controls.characterPresetPrompt}` : '',
    ].filter(Boolean).join('\n');
  }

  return [
    `ประเภทฉาก: ${controls.sceneType}`,
    `บรรยากาศ: ${controls.sceneMood}`,
    `แสง: ${controls.sceneLight}`,
    `มุมกล้อง: ${controls.sceneCamera}`,
  ].join('\n');
}

export function getCharacterReferenceLayoutLabel(value: CharacterReferenceLayout): string {
  return CHARACTER_REFERENCE_LAYOUT_OPTIONS.find((option) => option.value === value)?.label ?? 'ภาพเดียว';
}

export function Chip({
  active,
  label,
  onPress,
  theme,
  accent,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  theme: KubdeeTheme;
  accent: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-8 min-w-[58px] items-center justify-center rounded-kd-md border px-2.5"
      style={{
        borderColor: active ? accent : theme.border,
        backgroundColor: active ? getAccentTone(theme, accent).soft : theme.input,
      }}
    >
      <Text
        numberOfLines={1}
        className="text-kd-caption font-medium"
        style={{ color: active ? accent : theme.textMuted }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ModeTabs({
  active,
  onChange,
  theme,
}: {
  active: CreativeImageKind;
  onChange: (next: CreativeImageKind) => void;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View className="w-full flex-row self-stretch border-b border-kd-border bg-kd-card-muted dark:bg-kd-panel-muted">
      {MODE_TABS.map((tab) => {
        const selected = active === tab.key;
        const color = selected ? theme.text : theme.textSubtle;
        const Icon = tab.key === 'characters' ? User : ImageIcon;

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab.key}
            onPress={() => onChange(tab.key)}
            className="min-w-0 flex-1 flex-row items-center justify-center gap-1 px-0.5 py-3"
          >
            <Icon size={13} color={color} strokeWidth={2} />
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              numberOfLines={1}
              className={`min-w-0 flex-shrink text-kd-micro ${
                selected ? 'font-semibold text-kd-text' : 'font-medium text-kd-text-subtle'
              }`}
            >
              {tab.label}
            </Text>
            {selected ? <View className="absolute -bottom-px left-0 right-0 h-0.5 bg-kd-text" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionHeader({
  icon,
  title,
  theme,
}: {
  icon: React.ReactNode;
  title: string;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-2">
      {icon}
      <Text className="text-[13px] font-semibold text-kd-text">{title}</Text>
    </View>
  );
}

export function SelectBox({
  label,
  options,
  value,
  onChange,
  theme,
}: {
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  theme: KubdeeTheme;
}): React.JSX.Element {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;

  return (
    <View className="min-w-0 flex-1 gap-1.5">
      <Text className="text-kd-caption font-medium text-kd-text-subtle">{label}</Text>
      <View className="h-11 overflow-hidden rounded-kd-lg border border-kd-border bg-kd-input">
        <View
          pointerEvents="none"
          className="absolute bottom-0 left-3 right-8 top-0 justify-center"
        >
          <Text numberOfLines={1} className="text-kd-body font-medium text-kd-text">
            {selectedLabel}
          </Text>
        </View>
        <View
          pointerEvents="none"
          className="absolute bottom-0 right-0 top-0 w-8 items-center justify-center"
          style={{ backgroundColor: theme.input }}
        >
          <ChevronDown size={13} color={theme.textSubtle} strokeWidth={2.2} />
        </View>
        <Picker
          selectedValue={value}
          onValueChange={(itemValue) => onChange(String(itemValue))}
          mode="dialog"
          dropdownIconColor={theme.input}
          style={{
            color: 'transparent',
            backgroundColor: 'transparent',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          {options.map((option) => (
            <Picker.Item
              key={option.value}
              label={option.label}
              value={option.value}
              color={theme.text}
              style={{ fontFamily: kubdeeFontFamilies.thai.regular, fontSize: 14 }}
            />
          ))}
        </Picker>
      </View>
    </View>
  );
}

export function ChipGroup({
  label,
  options,
  selected,
  onSelect,
  theme,
  accent,
}: {
  label: string;
  options: string[];
  selected: string;
  onSelect: (next: string) => void;
  theme: KubdeeTheme;
  accent: string;
}): React.JSX.Element {
  return (
    <View className="gap-2">
      <Text className="text-kd-caption font-medium text-kd-text-subtle">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <Chip
            key={option}
            active={selected === option}
            label={option}
            onPress={() => onSelect(option)}
            theme={theme}
            accent={accent}
          />
        ))}
      </View>
    </View>
  );
}

export function SegmentedGroup({
  options,
  selected,
  onSelect,
  theme,
  accent,
}: {
  options: string[];
  selected: string;
  onSelect: (next: string) => void;
  theme: KubdeeTheme;
  accent: string;
}): React.JSX.Element {
  return (
    <View className="flex-row rounded-kd-lg bg-kd-panel-muted p-1 dark:bg-kd-card-muted">
      {options.map((option) => {
        const active = selected === option;

        return (
          <Pressable
            accessibilityRole="button"
            key={option}
            onPress={() => onSelect(option)}
            className={`h-8 min-w-0 flex-1 items-center justify-center rounded-kd-md px-1 ${
              active ? 'bg-kd-input' : ''
            }`}
          >
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              numberOfLines={1}
              className="text-kd-caption font-medium"
              style={{ color: active ? accent : theme.textMuted }}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function CharacterPresetGrid({
  accent,
  items,
  selectedValue,
  theme,
  onSelect,
}: {
  accent: string;
  items: CharacterPresetItem[];
  selectedValue: string | null;
  theme: KubdeeTheme;
  onSelect: (preset: CharacterPresetItem) => void;
}): React.JSX.Element | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <View className="flex-row flex-wrap gap-1.5">
      {items.map((preset) => {
        const active = selectedValue === preset.value;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={preset.value}
            onPress={() => onSelect(preset)}
            className="min-h-[54px] flex-grow basis-[23%] items-center justify-center gap-0.5 rounded-kd-lg border px-1.5 py-1.5"
            style={{
              borderColor: active ? accent : theme.border,
              backgroundColor: active ? getAccentTone(theme, accent).soft : theme.input,
            }}
          >
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              numberOfLines={1}
              className="text-kd-micro font-semibold"
              style={{ color: active ? accent : theme.textMuted }}
            >
              {preset.label}
            </Text>
            {preset.style || preset.clothing ? (
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                numberOfLines={1}
                className="text-[8px] font-medium text-kd-text-subtle"
              >
                {preset.style ?? preset.clothing}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function DraftCard({
  draft,
  index,
  kind,
  onChange,
  onPickReference,
  theme,
}: {
  draft: DraftItem;
  index: number;
  kind: CreativeImageKind;
  onChange: (next: DraftItem) => void;
  onPickReference: () => void;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View className="relative">
      <View className="absolute -left-1 -top-2 z-10 h-7 w-7 items-center justify-center rounded-full border border-kd-border bg-kd-card">
        <Text className="text-kd-caption font-bold text-kd-text-muted">{index + 1}</Text>
      </View>
      <View className="flex-row gap-2.5">
        <Pressable
          accessibilityRole="button"
          onPress={onPickReference}
          className="h-[86px] w-[86px] overflow-hidden rounded-kd-lg border border-dashed border-kd-border-strong bg-kd-panel-muted dark:bg-kd-card-muted"
        >
          {draft.referenceUri ? (
            <>
              <Image source={{ uri: draft.referenceUri }} className="h-full w-full" resizeMode="cover" />
              <View className="absolute bottom-0 left-0 right-0 bg-black/45 px-1.5 py-1">
                <Text numberOfLines={1} className="text-center text-kd-micro font-semibold text-white">
                  เปลี่ยนรูป
                </Text>
              </View>
            </>
          ) : (
            <View className="h-full w-full items-center justify-center gap-1.5">
              <ImagePlus size={20} color={theme.textSubtle} strokeWidth={1.8} />
              <Text className="text-kd-micro font-medium text-kd-text-subtle">ต้นแบบ</Text>
            </View>
          )}
        </Pressable>
        {draft.referenceUri ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onChange({ ...draft, referenceUri: null })}
            className="absolute left-[68px] top-1 z-10 h-7 w-7 items-center justify-center rounded-full bg-black/60"
          >
            <X size={14} color="#ffffff" strokeWidth={2.4} />
          </Pressable>
        ) : null}

        <View className="min-w-0 flex-1 overflow-hidden rounded-kd-lg border border-kd-border bg-kd-input">
          <TextInput
            value={draft.name}
            onChangeText={(name) => onChange({ ...draft, name })}
            placeholder={kind === 'characters' ? 'ชื่อตัวละคร...' : 'ชื่อฉาก...'}
            placeholderTextColor={theme.textSubtle}
            className="h-10 border-b border-kd-border px-3 text-kd-body text-kd-text"
            style={{ fontFamily: kubdeeFontFamilies.thai.medium }}
          />
          <TextInput
            value={draft.description}
            onChangeText={(description) => onChange({ ...draft, description })}
            placeholder={kind === 'characters' ? 'รายละเอียดตัวละคร...' : 'รายละเอียดฉาก...'}
            placeholderTextColor={theme.textSubtle}
            multiline
            textAlignVertical="top"
            className="min-h-[46px] px-3 pt-2 text-kd-caption text-kd-text"
            style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
          />
        </View>
      </View>
    </View>
  );
}
