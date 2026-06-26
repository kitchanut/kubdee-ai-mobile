import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import {
  BriefcaseBusiness,
  ChevronDown,
  Image as ImageIcon,
  List,
  Plus,
  Smile,
  Sparkles,
  User,
  Users,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DEFAULT_AUTO_PILOT_IMAGE_SETTINGS,
  DEFAULT_AUTO_PILOT_SETTINGS,
  DEFAULT_AUTO_PILOT_VIDEO_SETTINGS,
} from '@/autopilot/defaults';
import { startGoogleFlowRunner } from '@/autopilot/googleFlowRunnerBridge';
import type { GoogleFlowRunnerPayload, GoogleFlowRunnerProduct } from '@/autopilot/types';
import Text from '@/components/ui/KubdeeText';
import { buildCreativeImagePrompt, type CreativeImageKind } from '@/creative/creativeImageRunner';
import { useCreativeLibrary } from '@/library/CreativeLibraryContext';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';

import {
  getAccentTone,
} from '@/components/library/shared';

interface ImageWorkspaceLibraryStyleScreenProps {
  selectedProfileId: string;
  theme: KubdeeTheme;
}

type DraftItem = {
  id: string;
  name: string;
  description: string;
};

type ControlMap = Partial<Record<string, string>>;
type SelectOption = {
  label: string;
  value: string;
};
type CharacterPresetTabKey = 'ไม่มี' | 'ทั่วไป' | 'ไลฟ์สไตล์' | 'อาชีพ' | 'ครอบครัว';
type CharacterPresetItem = {
  value: string;
  label: string;
  style?: string;
  clothing?: string;
  prompt: string;
};

const MODE_TABS: Array<{ key: CreativeImageKind; label: string }> = [
  { key: 'characters', label: 'ตัวละคร' },
  { key: 'scenes', label: 'ฉาก' },
];

const ASPECT_OPTIONS = [
  { value: '9:16', label: 'แนวตั้ง (9:16)' },
  { value: '16:9', label: 'แนวนอน (16:9)' },
] as const;

const COUNT_OPTIONS = ['1', '2', '3', '4'] as const;
const CHARACTER_PRESET_TABS: CharacterPresetTabKey[] = ['ไม่มี', 'ทั่วไป', 'ไลฟ์สไตล์', 'อาชีพ', 'ครอบครัว'];
const CHARACTER_PRESET_ITEMS: Record<CharacterPresetTabKey, CharacterPresetItem[]> = {
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
const CHARACTER_TYPE_OPTIONS = ['คนจริง (เหมือนจริง)', 'การ์ตูน 3D', 'อนิเมะ', 'ภาพวาด', 'มาสคอต'];
const GENDER_OPTIONS = ['ไม่ระบุ', 'หญิง', 'ชาย', 'ไม่จำกัด'];
const AGE_OPTIONS = ['ไม่ระบุ', 'วัยรุ่น', 'วัยทำงาน', 'ผู้ใหญ่', 'สูงวัย'];
const ETHNICITY_OPTIONS = ['คนไทย', 'เอเชีย', 'ตะวันตก', 'ไม่ระบุ'];
const SKIN_TONE_OPTIONS = ['ไม่ระบุ', 'ขาว', 'สองสี', 'แทน', 'เข้ม'];
const EXPRESSION_OPTIONS = ['ไม่ระบุ', 'ยิ้ม', 'มั่นใจ', 'สดใส', 'จริงจัง'];
const OUTFIT_OPTIONS = ['ไม่ระบุ', 'ลำลอง', 'ทำงาน', 'พรีเมียม', 'กีฬา', 'แฟชั่น'];
const POSE_OPTIONS = ['ไม่ระบุ', 'ยืน', 'นั่ง', 'ถือสินค้า', 'ชี้สินค้า', 'ใช้งานสินค้า'];
const SCENE_TYPES = ['ออโต้', 'สตูดิโอ', 'บ้าน/ห้องจริง', 'ร้านค้า', 'โกดัง', 'โรงงาน', 'คาเฟ่', 'กลางแจ้ง'];
const SCENE_MOODS = ['ออโต้', 'อบอุ่น', 'มืออาชีพ', 'พรีเมียม', 'มินิมอล', 'สดใส', 'cinematic'];
const SCENE_LIGHTS = ['ออโต้', 'ธรรมชาติ', 'สตูดิโอ', 'แสงทอง', 'นีออน', 'ร้านค้า'];
const SCENE_CAMERAS = ['ออโต้', 'ระดับสายตา', 'โคลสอัพ', 'มุมกว้าง', 'มุมสูง'];

function createDraft(kind: CreativeImageKind, index: number): DraftItem {
  return {
    id: `${kind}-${Date.now()}-${index}`,
    name: '',
    description: '',
  };
}

function modeLabel(kind: CreativeImageKind): string {
  return kind === 'characters' ? 'ตัวละคร' : 'ฉาก';
}

function toOptions(options: readonly string[]): SelectOption[] {
  return options.map((option) => ({ label: option, value: option }));
}

function buildControlSummary(kind: CreativeImageKind, controls: ControlMap): string {
  if (kind === 'characters') {
    return [
      `ประเภทตัวละคร: ${controls.characterType}`,
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

function Chip({
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

function ModeTabs({
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

function SectionHeader({
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

function SelectBox({
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

function ChipGroup({
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

function SegmentedGroup({
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

function CharacterPresetGrid({
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

function DraftCard({
  draft,
  index,
  kind,
  onChange,
  theme,
}: {
  draft: DraftItem;
  index: number;
  kind: CreativeImageKind;
  onChange: (next: DraftItem) => void;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View className="relative">
      <View className="absolute -left-1 -top-2 z-10 h-7 w-7 items-center justify-center rounded-full border border-kd-border bg-kd-card">
        <Text className="text-kd-caption font-bold text-kd-text-muted">{index + 1}</Text>
      </View>
      <View className="flex-row gap-2.5">
        <Pressable className="h-[86px] w-[86px] items-center justify-center gap-1.5 rounded-kd-lg border border-dashed border-kd-border-strong bg-kd-panel-muted dark:bg-kd-card-muted">
          <ImageIcon size={20} color={theme.textSubtle} strokeWidth={1.8} />
          <Text className="text-kd-micro font-medium text-kd-text-subtle">ต้นแบบ</Text>
        </Pressable>

        <View className="min-w-0 flex-1 overflow-hidden rounded-kd-lg border border-kd-border bg-kd-input">
          <TextInput
            value={draft.name}
            onChangeText={(name) => onChange({ ...draft, name })}
            placeholder={kind === 'characters' ? 'ชื่อตัวละคร...' : 'ชื่อฉาก...'}
            placeholderTextColor={theme.textSubtle}
            className="h-10 border-b border-kd-border px-3 text-kd-body font-medium text-kd-text"
          />
          <TextInput
            value={draft.description}
            onChangeText={(description) => onChange({ ...draft, description })}
            placeholder={kind === 'characters' ? 'รายละเอียดตัวละคร...' : 'รายละเอียดฉาก...'}
            placeholderTextColor={theme.textSubtle}
            multiline
            textAlignVertical="top"
            className="min-h-[46px] px-3 pt-2 text-kd-caption text-kd-text"
          />
        </View>
      </View>
    </View>
  );
}

export default function ImageWorkspaceLibraryStyleScreen({
  selectedProfileId,
  theme,
}: ImageWorkspaceLibraryStyleScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { saveLibraryItem } = useCreativeLibrary();
  const accent = theme.amber;
  const tone = getAccentTone(theme, accent);
  const [mode, setMode] = useState<CreativeImageKind>('characters');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [outputCount, setOutputCount] = useState<'1' | '2' | '3' | '4'>('1');
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [characterDrafts, setCharacterDrafts] = useState<DraftItem[]>(() => [createDraft('characters', 0)]);
  const [sceneDrafts, setSceneDrafts] = useState<DraftItem[]>(() => [createDraft('scenes', 0)]);
  const [characterType, setCharacterType] = useState('คนจริง (เหมือนจริง)');
  const [characterPreset, setCharacterPreset] = useState<CharacterPresetTabKey>('ไม่มี');
  const [selectedCharacterPreset, setSelectedCharacterPreset] = useState<CharacterPresetItem | null>(null);
  const [gender, setGender] = useState('ไม่ระบุ');
  const [age, setAge] = useState('ไม่ระบุ');
  const [ethnicity, setEthnicity] = useState('คนไทย');
  const [skinTone, setSkinTone] = useState('ไม่ระบุ');
  const [expression, setExpression] = useState('ไม่ระบุ');
  const [outfit, setOutfit] = useState('ไม่ระบุ');
  const [pose, setPose] = useState('ไม่ระบุ');
  const [sceneType, setSceneType] = useState('ออโต้');
  const [sceneMood, setSceneMood] = useState('ออโต้');
  const [sceneLight, setSceneLight] = useState('ออโต้');
  const [sceneCamera, setSceneCamera] = useState('ออโต้');
  const [additionalInstruction, setAdditionalInstruction] = useState('');

  const drafts = mode === 'characters' ? characterDrafts : sceneDrafts;
  const label = modeLabel(mode);
  const HeaderIcon = mode === 'characters' ? User : ImageIcon;
  const controls = useMemo<ControlMap>(
    () =>
      mode === 'characters'
        ? {
            characterType,
            characterPreset,
            characterPresetItem: selectedCharacterPreset?.label,
            characterPresetPrompt: selectedCharacterPreset?.prompt,
            gender,
            age,
            ethnicity,
            skinTone,
            expression,
            outfit,
            pose,
          }
        : {
            sceneType,
            sceneMood,
            sceneLight,
            sceneCamera,
          },
    [
      age,
      characterPreset,
      characterType,
      ethnicity,
      expression,
      gender,
      mode,
      outfit,
      pose,
      selectedCharacterPreset,
      sceneCamera,
      sceneLight,
      sceneMood,
      sceneType,
      skinTone,
    ]
  );

  const updateDraft = (index: number, next: DraftItem): void => {
    const updater = (items: DraftItem[]) => items.map((item, itemIndex) => (itemIndex === index ? next : item));
    if (mode === 'characters') {
      setCharacterDrafts(updater);
    } else {
      setSceneDrafts(updater);
    }
  };

  const addDraft = (): void => {
    const nextIndex = drafts.length;
    if (mode === 'characters') {
      setCharacterDrafts((current) => [...current, createDraft('characters', nextIndex)]);
    } else {
      setSceneDrafts((current) => [...current, createDraft('scenes', nextIndex)]);
    }
  };

  const selectPresetTab = (tab: string): void => {
    const nextTab = CHARACTER_PRESET_TABS.includes(tab as CharacterPresetTabKey)
      ? (tab as CharacterPresetTabKey)
      : 'ไม่มี';
    setCharacterPreset(nextTab);
    setSelectedCharacterPreset(null);
  };

  const selectCharacterPreset = (preset: CharacterPresetItem): void => {
    setSelectedCharacterPreset(preset);
    if (preset.clothing) {
      setOutfit(preset.clothing);
    } else if (preset.style) {
      setOutfit(preset.style);
    }

    setAdditionalInstruction((current) => {
      const cleanCurrent = current.trim();
      if (!preset.prompt || cleanCurrent.includes(preset.prompt)) {
        return current;
      }
      return cleanCurrent ? `${cleanCurrent}\n\n${preset.prompt}` : preset.prompt;
    });
  };

  const startGeneration = async (): Promise<void> => {
    if (isStarting) return;
    if (!selectedProfileId.trim()) {
      Alert.alert('ยังไม่มีโปรไฟล์', 'กรุณาเลือกโปรไฟล์ก่อนเริ่มสร้างภาพ');
      return;
    }

    setIsStarting(true);
    try {
      const now = Date.now();
      const summary = buildControlSummary(mode, controls);
      const products: GoogleFlowRunnerProduct[] = [];

      for (let index = 0; index < drafts.length; index += 1) {
        const draft = drafts[index];
        const itemId = `${mode}-${now}-${index}`;
        const name = draft.name.trim() || `${label}ใหม่`;
        const description = [draft.description.trim(), summary, additionalInstruction.trim()]
          .filter(Boolean)
          .join('\n\n');
        const prompt = buildCreativeImagePrompt(mode, name, description);

        if (saveToLibrary) {
          await saveLibraryItem({
            id: itemId,
            kind: mode,
            profileLocalId: selectedProfileId,
            name,
            description: draft.description.trim() || null,
            imageUri: null,
            tags: mode === 'characters' ? 'character,mobile-google-flow' : 'scene,mobile-google-flow',
            source: 'mobile-google-flow',
            createdAt: now + index,
          });
        }

        products.push({
          id: itemId,
          catalogId: itemId,
          preview: null,
          name,
          description,
          productId: itemId,
          productUrl: '',
          caption: '',
          hashtags: '',
          cta: '',
          platform: `creative-${mode}`,
          settings: {
            image: {
              ...DEFAULT_AUTO_PILOT_IMAGE_SETTINGS,
              aspectRatio,
              outputCount,
              promptMode: 'custom',
              customPrompt: prompt,
              systemPrompt: '',
            },
            video: { ...DEFAULT_AUTO_PILOT_VIDEO_SETTINGS },
          },
          prompts: { image: prompt },
          creativeAssetKind: saveToLibrary ? mode : undefined,
          creativeItemId: saveToLibrary ? itemId : undefined,
          creativeItemName: saveToLibrary ? name : undefined,
          creativeItemDescription: saveToLibrary ? draft.description.trim() || null : undefined,
          creativeItemTags: saveToLibrary
            ? mode === 'characters'
              ? 'character,mobile-google-flow'
              : 'scene,mobile-google-flow'
            : undefined,
        });
      }

      const payload: GoogleFlowRunnerPayload = {
        sourceApp: 'mobile',
        runner: 'on-device-google-flow-webview',
        version: 1,
        profileLocalId: selectedProfileId,
        runId: `creative-${mode}-${now}`,
        enabledSteps: ['image'],
        settings: {
          ...DEFAULT_AUTO_PILOT_SETTINGS,
          totalRounds: 1,
          flowImageModel: DEFAULT_AUTO_PILOT_IMAGE_SETTINGS.imageModel,
        },
        products,
        promptCatalogVersion: null,
        promptCatalogSource: 'seed',
        createdAt: now,
      };

      const result = await startGoogleFlowRunner(payload);
      if (!result.success) {
        Alert.alert('เริ่มสร้างภาพไม่สำเร็จ', result.error ?? 'กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <View className="flex-1 bg-kd-panel">
      <ModeTabs active={mode} onChange={setMode} theme={theme} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-4 px-3 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(88, insets.bottom + 88) }}
      >
        <View className="gap-3">
          <SectionHeader icon={<List size={15} color={accent} strokeWidth={2} />} title="ข้อมูลพื้นฐาน" theme={theme} />
          <View className="flex-row gap-2">
            <SelectBox
              label="สัดส่วนภาพ"
              options={ASPECT_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
              value={aspectRatio}
              onChange={(value) => setAspectRatio(value === '16:9' ? '16:9' : '9:16')}
              theme={theme}
            />
            <SelectBox
              label="จำนวน"
              options={toOptions(COUNT_OPTIONS)}
              value={outputCount}
              onChange={(value) => setOutputCount(COUNT_OPTIONS.includes(value as (typeof COUNT_OPTIONS)[number]) ? (value as (typeof COUNT_OPTIONS)[number]) : '1')}
              theme={theme}
            />
          </View>
        </View>

        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <SectionHeader
              icon={<HeaderIcon size={15} color={accent} strokeWidth={2} />}
              title={`ข้อมูล${label} (${drafts.length})`}
              theme={theme}
            />
            <Pressable accessibilityRole="button" onPress={addDraft} className="h-8 flex-row items-center gap-1 px-1">
              <Plus size={13} color={theme.textSubtle} strokeWidth={2.5} />
              <Text className="text-kd-caption font-medium text-kd-text-subtle">เพิ่มรายการ</Text>
            </Pressable>
          </View>

          {drafts.map((draft, index) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              index={index}
              kind={mode}
              onChange={(next) => updateDraft(index, next)}
              theme={theme}
            />
          ))}
        </View>

        {mode === 'characters' ? (
          <>
            <View className="gap-3">
              <SelectBox
                label="ประเภทตัวละคร"
                options={toOptions(CHARACTER_TYPE_OPTIONS)}
                value={characterType}
                onChange={setCharacterType}
                theme={theme}
              />
              <SectionHeader icon={<Users size={15} color={accent} strokeWidth={2} />} title="เลือกคาแรกเตอร์" theme={theme} />
              <SegmentedGroup
                options={CHARACTER_PRESET_TABS}
                selected={characterPreset}
                onSelect={selectPresetTab}
                theme={theme}
                accent={accent}
              />
              <CharacterPresetGrid
                accent={accent}
                items={CHARACTER_PRESET_ITEMS[characterPreset]}
                selectedValue={selectedCharacterPreset?.value ?? null}
                theme={theme}
                onSelect={selectCharacterPreset}
              />
            </View>

            <View className="gap-3">
              <SectionHeader icon={<Smile size={15} color={accent} strokeWidth={2} />} title="ลักษณะตัวละคร" theme={theme} />
              <View className="flex-row gap-2">
                <SelectBox label="เพศ" options={toOptions(GENDER_OPTIONS)} value={gender} onChange={setGender} theme={theme} />
                <SelectBox label="ช่วงอายุ" options={toOptions(AGE_OPTIONS)} value={age} onChange={setAge} theme={theme} />
              </View>
              <View className="flex-row gap-2">
                <SelectBox label="เชื้อชาติ" options={toOptions(ETHNICITY_OPTIONS)} value={ethnicity} onChange={setEthnicity} theme={theme} />
                <SelectBox label="สีผิว" options={toOptions(SKIN_TONE_OPTIONS)} value={skinTone} onChange={setSkinTone} theme={theme} />
                <SelectBox label="การแสดงออก" options={toOptions(EXPRESSION_OPTIONS)} value={expression} onChange={setExpression} theme={theme} />
              </View>
            </View>

            <View className="gap-3">
              <SectionHeader icon={<BriefcaseBusiness size={15} color={accent} strokeWidth={2} />} title="การแต่งกายและท่าทาง" theme={theme} />
              <View className="flex-row gap-2">
                <SelectBox label="การแต่งกาย" options={toOptions(OUTFIT_OPTIONS)} value={outfit} onChange={setOutfit} theme={theme} />
                <SelectBox label="ท่าทาง" options={toOptions(POSE_OPTIONS)} value={pose} onChange={setPose} theme={theme} />
              </View>
            </View>
          </>
        ) : (
          <View className="gap-3">
            <ChipGroup label="ประเภทฉาก" options={SCENE_TYPES} selected={sceneType} onSelect={setSceneType} theme={theme} accent={accent} />
            <ChipGroup label="บรรยากาศ" options={SCENE_MOODS} selected={sceneMood} onSelect={setSceneMood} theme={theme} accent={accent} />
            <ChipGroup label="แสง" options={SCENE_LIGHTS} selected={sceneLight} onSelect={setSceneLight} theme={theme} accent={accent} />
            <ChipGroup label="มุมกล้อง" options={SCENE_CAMERAS} selected={sceneCamera} onSelect={setSceneCamera} theme={theme} accent={accent} />
          </View>
        )}

        <View className="gap-1.5">
          <Text className="text-kd-caption font-semibold text-kd-text-subtle">คำสั่งเพิ่มเติม (ไม่บังคับ)</Text>
          <TextInput
            value={additionalInstruction}
            onChangeText={setAdditionalInstruction}
            placeholder="เช่น ผมยาวสีดำ, แต่งหน้าเบาๆ, สวมแว่นตา..."
            placeholderTextColor={theme.textSubtle}
            multiline
            textAlignVertical="top"
            className="min-h-[72px] rounded-kd-lg border border-kd-border bg-kd-input px-3 py-2 text-kd-caption text-kd-text"
          />
        </View>

        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: saveToLibrary }}
          onPress={() => setSaveToLibrary((current) => !current)}
          className="flex-row items-center justify-between rounded-kd-xl border border-kd-border bg-kd-card p-3"
        >
          <View className="flex-row items-center gap-2">
            <HeaderIcon size={15} color={accent} strokeWidth={2} />
            <Text className="text-kd-body font-semibold text-kd-text">บันทึกลงคลัง{label}</Text>
          </View>
          <View className={`h-5 w-9 justify-center rounded-full px-0.5 ${saveToLibrary ? '' : 'bg-kd-border-strong'}`} style={saveToLibrary ? { backgroundColor: accent } : undefined}>
            <View className={`h-4 w-4 rounded-full bg-white ${saveToLibrary ? 'self-end' : 'self-start'}`} />
          </View>
        </Pressable>
      </ScrollView>

      <View
        pointerEvents="box-none"
        className="absolute bottom-0 left-0 right-0 border-t border-kd-border bg-kd-panel px-3 pt-2"
        style={{ paddingBottom: Math.max(12, insets.bottom + 8) }}
      >
        <Pressable
          accessibilityRole="button"
          disabled={isStarting}
          onPress={() => void startGeneration()}
          className="h-11 flex-row items-center justify-center gap-2 rounded-kd-lg bg-kd-text disabled:opacity-60"
        >
          {isStarting ? <ActivityIndicator size="small" color={theme.screen} /> : <Sparkles size={14} color={theme.screen} strokeWidth={2.5} />}
          <Text className="text-kd-body font-semibold text-kd-panel">เริ่มสร้าง{label}</Text>
        </Pressable>
      </View>
    </View>
  );
}
