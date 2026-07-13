import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import {
  BriefcaseBusiness,
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
import {
  buildCreativeImagePrompt,
  type CharacterReferenceLayout,
  type CreativeImageKind,
} from '@/creative/creativeImageRunner';
import { useCreativeLibrary } from '@/library/CreativeLibraryContext';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';

import {
  getAccentTone,
} from '@/components/library/shared';

import {
  AGE_OPTIONS,
  ASPECT_OPTIONS,
  CHARACTER_PRESET_ITEMS,
  CHARACTER_PRESET_TABS,
  CHARACTER_REFERENCE_LAYOUT_OPTIONS,
  CHARACTER_TYPE_OPTIONS,
  ChipGroup,
  COUNT_OPTIONS,
  DraftCard,
  ETHNICITY_OPTIONS,
  EXPRESSION_OPTIONS,
  GENDER_OPTIONS,
  ModeTabs,
  OUTFIT_OPTIONS,
  POSE_OPTIONS,
  SCENE_CAMERAS,
  SCENE_LIGHTS,
  SCENE_MOODS,
  SCENE_TYPES,
  SKIN_TONE_OPTIONS,
  SectionHeader,
  SegmentedGroup,
  SelectBox,
  CharacterPresetGrid,
  buildControlSummary,
  copyPickedReferenceImageToLibrary,
  createDraft,
  getCharacterReferenceLayoutLabel,
  modeLabel,
  toOptions,
} from './image-workspace-library-style/support';
import type { CharacterPresetItem, CharacterPresetTabKey, ControlMap, DraftItem } from './image-workspace-library-style/support';

interface ImageWorkspaceLibraryStyleScreenProps {
  selectedProfileId: string;
  theme: KubdeeTheme;
}

export default function ImageWorkspaceLibraryStyleScreen({
  selectedProfileId,
  theme,
}: ImageWorkspaceLibraryStyleScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const startButtonBottomPadding = Platform.OS === 'ios' ? Math.max(insets.bottom, 10) : 8;
  const startButtonScrollPadding = 12 + 44 + startButtonBottomPadding + 16;
  const { saveLibraryItem } = useCreativeLibrary();
  const accent = theme.amber;
  const [mode, setMode] = useState<CreativeImageKind>('characters');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [outputCount, setOutputCount] = useState<'1' | '2' | '3' | '4'>('1');
  const [isStarting, setIsStarting] = useState(false);
  const [pickingDraftId, setPickingDraftId] = useState<string | null>(null);
  const [characterDrafts, setCharacterDrafts] = useState<DraftItem[]>(() => [createDraft('characters', 0)]);
  const [sceneDrafts, setSceneDrafts] = useState<DraftItem[]>(() => [createDraft('scenes', 0)]);
  const [characterType, setCharacterType] = useState('คนจริง (เหมือนจริง)');
  const [characterReferenceLayout, setCharacterReferenceLayout] = useState<CharacterReferenceLayout>('single');
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
            characterReferenceLayout: getCharacterReferenceLayoutLabel(characterReferenceLayout),
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
      characterReferenceLayout,
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

  const pickDraftReference = async (index: number): Promise<void> => {
    const draft = drafts[index];
    if (!draft || pickingDraftId) return;

    setPickingDraftId(draft.id);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('ยังไม่ได้อนุญาตรูปภาพ', 'กรุณาอนุญาตให้แอปเข้าถึงรูปภาพก่อนแนบรูปต้นแบบ');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset?.uri) {
        Alert.alert('เลือกรูปไม่สำเร็จ', 'ไม่พบไฟล์รูปภาพที่เลือก');
        return;
      }

      const referenceUri = await copyPickedReferenceImageToLibrary(asset.uri, mode, asset.fileName);
      updateDraft(index, { ...draft, referenceUri });
    } catch (error) {
      Alert.alert('แนบรูปไม่สำเร็จ', error instanceof Error ? error.message : 'กรุณาลองใหม่อีกครั้ง');
    } finally {
      setPickingDraftId(null);
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
        const cleanDraftDescription = draft.description.trim();
        const libraryDescription =
          mode === 'characters' && characterReferenceLayout === 'grid3x3'
            ? [
                cleanDraftDescription,
                'รูปแบบรูปตัวละคร: ชีทอ้างอิง 3x3 สำหรับคงใบหน้า รูปร่าง ชุด และบุคลิก ห้ามใช้เป็นคำสั่งให้สร้างภาพเป็นตารางเมื่อเอาไปใช้ต่อ',
              ].filter(Boolean).join('\n')
            : cleanDraftDescription || null;
        const creativeItemTags = mode === 'characters'
          ? `character,mobile-google-flow,${characterReferenceLayout === 'grid3x3' ? 'character-sheet-3x3' : 'single-reference'}`
          : 'scene,mobile-google-flow';
        const description = [draft.description.trim(), summary, additionalInstruction.trim()]
          .filter(Boolean)
          .join('\n\n');
        const prompt = buildCreativeImagePrompt(mode, name, description, {
          characterReferenceLayout: mode === 'characters' ? characterReferenceLayout : undefined,
          hasReferenceImage: Boolean(draft.referenceUri),
        });

        await saveLibraryItem({
          id: itemId,
          kind: mode,
          profileLocalId: selectedProfileId,
          name,
          description: libraryDescription,
          imageUri: draft.referenceUri,
          tags: creativeItemTags,
          source: 'mobile-google-flow',
          createdAt: now + index,
        });

        products.push({
          id: itemId,
          catalogId: itemId,
          preview: draft.referenceUri,
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
              characterMode: mode === 'characters' && draft.referenceUri ? 'upload' : DEFAULT_AUTO_PILOT_IMAGE_SETTINGS.characterMode,
              selectedCharacterId: mode === 'characters' && draft.referenceUri ? itemId : DEFAULT_AUTO_PILOT_IMAGE_SETTINGS.selectedCharacterId,
              customCharacterUri: mode === 'characters' ? draft.referenceUri : DEFAULT_AUTO_PILOT_IMAGE_SETTINGS.customCharacterUri,
              customCharacterPreview: mode === 'characters' ? draft.referenceUri ?? '' : DEFAULT_AUTO_PILOT_IMAGE_SETTINGS.customCharacterPreview,
              sceneMode: mode === 'scenes' && draft.referenceUri ? 'upload' : DEFAULT_AUTO_PILOT_IMAGE_SETTINGS.sceneMode,
              selectedSceneId: mode === 'scenes' && draft.referenceUri ? itemId : DEFAULT_AUTO_PILOT_IMAGE_SETTINGS.selectedSceneId,
              customSceneUri: mode === 'scenes' ? draft.referenceUri : DEFAULT_AUTO_PILOT_IMAGE_SETTINGS.customSceneUri,
              customScenePreview: mode === 'scenes' ? draft.referenceUri ?? '' : DEFAULT_AUTO_PILOT_IMAGE_SETTINGS.customScenePreview,
              systemPrompt: '',
            },
            video: { ...DEFAULT_AUTO_PILOT_VIDEO_SETTINGS },
          },
          prompts: { image: prompt },
          creativeAssetKind: mode,
          creativeItemId: itemId,
          creativeItemName: name,
          creativeItemDescription: libraryDescription,
          creativeItemTags,
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
        contentContainerStyle={{ paddingBottom: startButtonScrollPadding }}
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
              onPickReference={() => void pickDraftReference(index)}
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
              <View className="gap-1.5">
                <SectionHeader
                  icon={<ImageIcon size={15} color={accent} strokeWidth={2} />}
                  title="รูปแบบรูปตัวละคร"
                  theme={theme}
                />
                <View className="flex-row gap-2">
                  {CHARACTER_REFERENCE_LAYOUT_OPTIONS.map((option) => {
                    const selected = characterReferenceLayout === option.value;

                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={option.value}
                        onPress={() => setCharacterReferenceLayout(option.value)}
                        className="min-h-[74px] flex-1 rounded-kd-lg border px-3 py-2"
                        style={{
                          borderColor: selected ? accent : theme.border,
                          backgroundColor: selected ? getAccentTone(theme, accent).soft : theme.card,
                        }}
                      >
                        <Text
                          className="text-kd-body font-semibold"
                          style={{ color: selected ? accent : theme.text }}
                        >
                          {option.label}
                        </Text>
                        <Text className="mt-1 text-kd-micro text-kd-text-subtle">
                          {option.description}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
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
            style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
          />
        </View>
      </ScrollView>

      <View
        pointerEvents="box-none"
        className="absolute bottom-0 left-0 right-0 overflow-hidden px-3 pt-3"
        style={{ paddingBottom: startButtonBottomPadding }}
      >
        <BlurView
          pointerEvents="none"
          intensity={theme.isDark ? 28 : 42}
          tint={theme.isDark ? 'dark' : 'light'}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: theme.isDark ? 'rgba(17, 24, 39, 0.52)' : 'rgba(255, 255, 255, 0.62)',
          }}
        />
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
