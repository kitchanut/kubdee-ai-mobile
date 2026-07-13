import { Image as ImageIcon, ImagePlus, List, Plus, Sparkles, UserRound, UsersRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DEFAULT_AUTO_PILOT_IMAGE_SETTINGS,
  DEFAULT_AUTO_PILOT_SETTINGS,
  DEFAULT_AUTO_PILOT_VIDEO_SETTINGS,
} from '@/autopilot/defaults';
import { startGoogleFlowRunner } from '@/autopilot/googleFlowRunnerBridge';
import type { GoogleFlowRunnerPayload, GoogleFlowRunnerProduct } from '@/autopilot/types';
import { buildCreativeImagePrompt, type CreativeImageKind } from '@/creative/creativeImageRunner';
import { useCreativeLibrary } from '@/library/CreativeLibraryContext';
import type { KubdeeTheme } from '@/theme/tokens';

type DraftItem = {
  id: string;
  name: string;
  description: string;
  referenceUri: string | null;
};

type SelectKey =
  | 'ไม่ระบุ'
  | 'คนไทย'
  | 'คนจริง (เหมือนจริง)'
  | 'ธรรมชาติ'
  | 'ออโต้'
  | 'ไม่มี';

interface ImageWorkspaceScreenProps {
  selectedProfileId: string;
  theme: KubdeeTheme;
}

const ASPECT_OPTIONS = [
  { value: '16:9', label: 'แนวนอน (16:9)' },
  { value: '9:16', label: 'แนวตั้ง (9:16)' },
] as const;

const COUNT_OPTIONS = ['1', '2', '3', '4'] as const;

const CHARACTER_PRESETS = ['ไม่มี', 'ทั่วไป', 'ไลฟ์สไตล์', 'อาชีพ', 'ครอบครัว'];
const SCENE_TYPES = ['ออโต้', 'สตูดิโอ', 'บ้าน/ห้องจริง', 'ร้านค้า', 'โกดัง', 'โรงงาน', 'คาเฟ่/ร้านอาหาร', 'กลางแจ้ง', 'ไวรัล', 'แฟนตาซี'];
const SCENE_MOODS = ['ออโต้', 'อบอุ่น', 'มืออาชีพ', 'พรีเมียม', 'โปรแรง', 'มินิมอล', 'สดใส', 'cinematic'];
const SCENE_LIGHTS = ['ออโต้', 'ธรรมชาติ', 'สตูดิโอ', 'แสงทอง', 'นีออน', 'ร้านค้า', 'โรงงาน'];
const SCENE_CAMERAS = ['ออโต้', 'ระดับสายตา', 'โคลสอัพ', 'มุมกว้าง', 'มุมสูง'];

function createDraft(kind: CreativeImageKind, index: number): DraftItem {
  const prefix = kind === 'characters' ? 'character' : 'scene';
  return {
    id: `${prefix}-${Date.now()}-${index}`,
    name: '',
    description: '',
    referenceUri: null,
  };
}

function formatKindLabel(kind: CreativeImageKind): string {
  return kind === 'characters' ? 'ตัวละคร' : 'ฉาก';
}

function buildControlSummary(kind: CreativeImageKind, values: Partial<Record<string, string>>): string {
  if (kind === 'characters') {
    return [
      `ประเภทตัวละคร: ${values.characterType}`,
      `คาแรกเตอร์: ${values.characterPreset}`,
      `เพศ: ${values.gender}`,
      `ช่วงอายุ: ${values.age}`,
      `เชื้อชาติ: ${values.ethnicity}`,
      `สีผิว: ${values.skinTone}`,
      `การแสดงออก: ${values.expression}`,
      `การแต่งกาย: ${values.outfit}`,
      `ท่าทาง: ${values.pose}`,
    ].join('\n');
  }

  return [
    `ประเภทฉาก: ${values.sceneType}`,
    `บรรยากาศ: ${values.sceneMood}`,
    `แสง: ${values.sceneLight}`,
    `มุมกล้อง: ${values.sceneCamera}`,
  ].join('\n');
}

function Toggle({
  enabled,
  onPress,
  theme,
}: {
  enabled: boolean;
  onPress: () => void;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      onPress={onPress}
      style={{
        width: 54,
        height: 32,
        borderRadius: 999,
        backgroundColor: enabled ? theme.amber : theme.borderStrong,
        padding: 3,
        justifyContent: 'center',
        alignItems: enabled ? 'flex-end' : 'flex-start',
      }}
    >
      <View style={{ width: 26, height: 26, borderRadius: 999, backgroundColor: theme.white }} />
    </Pressable>
  );
}

function SectionTitle({
  children,
  icon,
  theme,
}: {
  children: string;
  icon: React.ReactNode;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, marginBottom: 12 }}>
      {icon}
      <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>{children}</Text>
    </View>
  );
}

function FieldBox({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: theme.textSubtle, fontSize: 13, fontWeight: '800', marginBottom: 8 }}>{label}</Text>
      <View
        style={{
          minHeight: 58,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.input,
          justifyContent: 'center',
          paddingHorizontal: 14,
        }}
      >
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>{value}</Text>
      </View>
    </View>
  );
}

function Chip({
  active,
  label,
  onPress,
  theme,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={{
        minHeight: 48,
        minWidth: 74,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: active ? theme.amber : theme.border,
        backgroundColor: active ? theme.amberSoft : theme.card,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
      }}
    >
      <Text
        style={{
          color: active ? theme.amber : theme.textMuted,
          fontSize: 14,
          fontWeight: '800',
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ChipGroup({
  label,
  options,
  selected,
  onSelect,
  theme,
}: {
  label: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ color: theme.textSubtle, fontSize: 13, fontWeight: '800', marginBottom: 10 }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => (
          <Chip
            key={option}
            active={selected === option}
            label={option}
            onPress={() => onSelect(option)}
            theme={theme}
          />
        ))}
      </View>
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
    <View
      style={{
        marginTop: 4,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card,
        padding: 12,
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: -14,
          left: -2,
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
        }}
      >
        <Text style={{ color: theme.textMuted, fontWeight: '900' }}>{index + 1}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable
          style={{
            width: 116,
            aspectRatio: 1,
            borderRadius: 12,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: theme.borderStrong,
            backgroundColor: theme.panelMuted,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <ImageIcon size={30} color={theme.textSubtle} />
          <Text style={{ color: theme.textSubtle, fontSize: 12, fontWeight: '800' }}>ต้นแบบ</Text>
        </Pressable>
        <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' }}>
          <TextInput
            value={draft.name}
            onChangeText={(name) => onChange({ ...draft, name })}
            placeholder={kind === 'characters' ? 'ชื่อตัวละคร...' : 'ชื่อฉาก...'}
            placeholderTextColor={theme.textSubtle}
            style={{
              minHeight: 52,
              paddingHorizontal: 14,
              color: theme.text,
              fontSize: 17,
              fontWeight: '800',
              backgroundColor: theme.input,
            }}
          />
          <View style={{ height: 1, backgroundColor: theme.border }} />
          <TextInput
            value={draft.description}
            onChangeText={(description) => onChange({ ...draft, description })}
            placeholder={
              kind === 'characters'
                ? 'รายละเอียดตัวละคร...'
                : 'รายละเอียดฉาก เช่น โกดังจริง มีกล่องสินค้า ชั้นวาง ป้ายโปรโมชั่น...'
            }
            placeholderTextColor={theme.textSubtle}
            multiline
            style={{
              minHeight: 72,
              paddingHorizontal: 14,
              paddingTop: 12,
              color: theme.text,
              fontSize: 15,
              fontWeight: '700',
              backgroundColor: theme.input,
              textAlignVertical: 'top',
            }}
          />
        </View>
      </View>
    </View>
  );
}

export default function ImageWorkspaceScreen({
  selectedProfileId,
  theme,
}: ImageWorkspaceScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { saveLibraryItem } = useCreativeLibrary();
  const [mode, setMode] = useState<CreativeImageKind>('characters');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [outputCount, setOutputCount] = useState<'1' | '2' | '3' | '4'>('1');
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [characterDrafts, setCharacterDrafts] = useState<DraftItem[]>(() => [createDraft('characters', 0)]);
  const [sceneDrafts, setSceneDrafts] = useState<DraftItem[]>(() => [createDraft('scenes', 0)]);

  const characterType: SelectKey = 'คนจริง (เหมือนจริง)';
  const [characterPreset, setCharacterPreset] = useState('ไม่มี');
  const gender: SelectKey = 'ไม่ระบุ';
  const age: SelectKey = 'ไม่ระบุ';
  const ethnicity: SelectKey = 'คนไทย';
  const skinTone: SelectKey = 'ไม่ระบุ';
  const expression: SelectKey = 'ไม่ระบุ';
  const outfit: SelectKey = 'ไม่ระบุ';
  const pose: SelectKey = 'ไม่ระบุ';

  const [sceneType, setSceneType] = useState('ออโต้');
  const [sceneMood, setSceneMood] = useState('ออโต้');
  const [sceneLight, setSceneLight] = useState('ออโต้');
  const [sceneCamera, setSceneCamera] = useState('ออโต้');

  const drafts = mode === 'characters' ? characterDrafts : sceneDrafts;
  const modeLabel = formatKindLabel(mode);
  const titleIcon = mode === 'characters' ? <UserRound size={18} color={theme.amber} /> : <ImageIcon size={18} color={theme.amber} />;

  const controlValues = useMemo(
    () =>
      mode === 'characters'
        ? {
            characterType,
            characterPreset,
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

  const startGeneration = async (): Promise<void> => {
    if (isStarting) return;
    if (!selectedProfileId) {
      Alert.alert('ยังไม่มีโปรไฟล์', 'กรุณาเลือกโปรไฟล์ก่อนเริ่มสร้างภาพ');
      return;
    }

    const cleanDrafts = drafts.map((draft) => ({
      ...draft,
      name: draft.name.trim() || `${modeLabel}ใหม่`,
      description: draft.description.trim(),
    }));

    setIsStarting(true);
    try {
      const now = Date.now();
      const summary = buildControlSummary(mode, controlValues);
      const products: GoogleFlowRunnerProduct[] = [];

      for (let index = 0; index < cleanDrafts.length; index += 1) {
        const draft = cleanDrafts[index];
        const itemId = `${mode}-${now}-${index}`;
        const description = [draft.description, summary].filter(Boolean).join('\n\n');
        const prompt = buildCreativeImagePrompt(mode, draft.name, description);

        if (saveToLibrary) {
          await saveLibraryItem({
            id: itemId,
            kind: mode,
            profileLocalId: selectedProfileId,
            name: draft.name,
            description: draft.description || null,
            imageUri: draft.referenceUri,
            tags: mode === 'characters' ? 'character,mobile-google-flow' : 'scene,mobile-google-flow',
            source: 'mobile-google-flow',
            createdAt: now + index,
          });
        }

        products.push({
          id: itemId,
          catalogId: itemId,
          preview: draft.referenceUri,
          name: draft.name,
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
          creativeItemName: saveToLibrary ? draft.name : undefined,
          creativeItemDescription: saveToLibrary ? draft.description || null : undefined,
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
    <View style={{ flex: 1, backgroundColor: theme.screen }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 104 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 10 }}>
          <ImagePlus size={22} color={theme.text} />
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900' }}>สร้างภาพ</Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            backgroundColor: theme.panelMuted,
          }}
        >
          {[
            { id: 'characters' as const, label: 'ตัวละคร', icon: <UserRound size={18} color={mode === 'characters' ? theme.amber : theme.textSubtle} /> },
            { id: 'scenes' as const, label: 'ฉาก', icon: <ImageIcon size={18} color={mode === 'scenes' ? theme.amber : theme.textSubtle} /> },
          ].map((tab) => (
            <Pressable
              key={tab.id}
              onPress={() => setMode(tab.id)}
              style={{
                flex: 1,
                minHeight: 76,
                alignItems: 'center',
                justifyContent: 'center',
                borderBottomWidth: 3,
                borderBottomColor: mode === tab.id ? theme.amber : 'transparent',
                gap: 6,
              }}
            >
              {tab.icon}
              <Text style={{ color: mode === tab.id ? theme.amber : theme.textSubtle, fontWeight: '900' }}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <SectionTitle icon={<List size={19} color={theme.amber} />} theme={theme}>
          ข้อมูลพื้นฐาน
        </SectionTitle>

        {mode === 'characters' ? (
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <FieldBox
              label="สัดส่วนภาพ"
              value={ASPECT_OPTIONS.find((option) => option.value === aspectRatio)?.label ?? 'แนวตั้ง (9:16)'}
              theme={theme}
            />
            <FieldBox label="จำนวน" value={outputCount} theme={theme} />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {ASPECT_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  active={aspectRatio === option.value}
                  label={option.label.replace(' (', '\n(')}
                  onPress={() => setAspectRatio(option.value)}
                  theme={theme}
                />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {COUNT_OPTIONS.map((option) => (
                <Chip
                  key={option}
                  active={outputCount === option}
                  label={option}
                  onPress={() => setOutputCount(option)}
                  theme={theme}
                />
              ))}
            </View>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            {titleIcon}
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '900' }}>
              ข้อมูล{modeLabel} ({drafts.length})
            </Text>
          </View>
          <Pressable onPress={addDraft} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Plus size={18} color={theme.textSubtle} />
            <Text style={{ color: theme.textSubtle, fontSize: 15, fontWeight: '800' }}>เพิ่มรายการ</Text>
          </Pressable>
        </View>

        <View style={{ gap: 18, marginTop: 12 }}>
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
            <View style={{ marginTop: 22 }}>
              <FieldBox label="ประเภทตัวละคร" value={characterType} theme={theme} />
            </View>
            <ChipGroup
              label="เลือกคาแรกเตอร์"
              options={CHARACTER_PRESETS}
              selected={characterPreset}
              onSelect={setCharacterPreset}
              theme={theme}
            />
            <SectionTitle icon={<UserRound size={19} color={theme.amber} />} theme={theme}>
              ลักษณะตัวละคร
            </SectionTitle>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <FieldBox label="เพศ" value={gender} theme={theme} />
              <FieldBox label="ช่วงอายุ" value={age} theme={theme} />
            </View>
            <View style={{ flexDirection: 'row', gap: 14, marginTop: 14 }}>
              <FieldBox label="เชื้อชาติ" value={ethnicity} theme={theme} />
              <FieldBox label="สีผิว" value={skinTone} theme={theme} />
            </View>
            <View style={{ marginTop: 14 }}>
              <FieldBox label="การแสดงออก" value={expression} theme={theme} />
            </View>
            <SectionTitle icon={<UsersRound size={19} color={theme.amber} />} theme={theme}>
              การแต่งกายและท่าทาง
            </SectionTitle>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <FieldBox label="การแต่งกาย" value={outfit} theme={theme} />
              <FieldBox label="ท่าทาง" value={pose} theme={theme} />
            </View>
          </>
        ) : (
          <>
            <ChipGroup label="ประเภทฉาก" options={SCENE_TYPES} selected={sceneType} onSelect={setSceneType} theme={theme} />
            <ChipGroup label="บรรยากาศ" options={SCENE_MOODS} selected={sceneMood} onSelect={setSceneMood} theme={theme} />
            <ChipGroup label="แสง" options={SCENE_LIGHTS} selected={sceneLight} onSelect={setSceneLight} theme={theme} />
            <ChipGroup label="มุมกล้อง" options={SCENE_CAMERAS} selected={sceneCamera} onSelect={setSceneCamera} theme={theme} />
          </>
        )}

        <View
          style={{
            marginTop: 22,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.card,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {titleIcon}
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>บันทึกลงคลัง{modeLabel}</Text>
          </View>
          <Toggle enabled={saveToLibrary} onPress={() => setSaveToLibrary((current) => !current)} theme={theme} />
        </View>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: insets.bottom + 12,
          backgroundColor: theme.screen,
          borderTopWidth: 1,
          borderTopColor: theme.border,
        }}
      >
        <Pressable
          disabled={isStarting}
          onPress={startGeneration}
          style={{
            minHeight: 54,
            borderRadius: 14,
            backgroundColor: theme.amber,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 10,
            opacity: isStarting ? 0.7 : 1,
          }}
        >
          {isStarting ? <ActivityIndicator color={theme.white} /> : <Sparkles size={19} color={theme.white} />}
          <Text style={{ color: theme.white, fontSize: 16, fontWeight: '900' }}>เริ่มสร้าง{modeLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}
