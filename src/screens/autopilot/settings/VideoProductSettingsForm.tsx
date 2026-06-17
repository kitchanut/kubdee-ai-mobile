import { Pressable, View } from 'react-native';
import { Ban, Bot, Plus, Settings2, SlidersHorizontal, Sparkles, Star, X } from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import { Input } from '@/components/ui/input';
import type { AutoPilotPromptMode, AutoPilotVideoSettings } from '@/autopilot/types';
import {
  ASPECT_RATIO_OPTIONS,
  CAMERA_OPTIONS,
  DIALOGUE_MODE_OPTIONS,
  DIALOGUE_ORDER_OPTIONS,
  MUSIC_SFX_MODE_OPTIONS,
  OUTPUT_COUNT_VALUES,
  SCENE_COUNT_VALUES,
  SCRIPT_STYLE_OPTIONS,
  VIDEO_CHARACTER_MODE_OPTIONS,
  VIDEO_PROMPT_MODE_OPTIONS,
  VIDEO_STYLE_OPTIONS,
  VOICE_OPTIONS,
} from '@/autopilot/optionSets';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';

import { VIDEO_SECTION_KEYS } from '../constants';
import { FieldHeader, OptionGroup, SettingInput, SettingsSection } from '../primitives';
import { CardOptionGrid } from './CardOptionGrid';
import { ManualPromptInput } from './ManualPromptInput';
import { UserPresetGridLite } from './UserPresetGridLite';

const COUNT_OPTIONS = OUTPUT_COUNT_VALUES.map((count) => ({ label: count, value: count }));
const SCENE_OPTIONS = SCENE_COUNT_VALUES.map((count) => ({ label: count, value: count }));

export function VideoProductSettingsForm({
  settings,
  theme,
  onApplySection,
  onChange,
}: {
  settings: AutoPilotVideoSettings;
  theme: KubdeeTheme;
  onApplySection: (keys: Array<keyof AutoPilotVideoSettings>) => void;
  onChange: <K extends keyof AutoPilotVideoSettings>(key: K, value: AutoPilotVideoSettings[K]) => void;
}): React.JSX.Element {
  const accent = theme.red;
  const multiScene = parseInt(settings.sceneCount || '1', 10) > 1;

  // ───── บทพูด: dialogue list ─────
  const dialogueList =
    settings.dialogueList && settings.dialogueList.length > 0
      ? settings.dialogueList
      : settings.dialogue
        ? [settings.dialogue]
        : [''];

  const updateDialogueList = (next: string[]): void => {
    onChange('dialogueList', next);
    onChange('dialogue', next[0] ?? '');
  };

  return (
    <View className="gap-5">
      {/* 1. ตั้งค่าพื้นฐาน */}
      <SettingsSection
        color={accent}
        icon={SlidersHorizontal}
        theme={theme}
        title="ตั้งค่าพื้นฐาน"
        onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.basic)}
      >
        <View className="gap-2">
          <View className="flex-row gap-3">
            <OptionGroup
              columns={2}
              label="สัดส่วนภาพ"
              options={ASPECT_RATIO_OPTIONS}
              theme={theme}
              accent={accent}
              value={settings.aspectRatio}
              onChange={(value) => onChange('aspectRatio', String(value))}
            />
            <OptionGroup
              columns={4}
              label={multiScene ? 'จำนวน (หลายฉาก=1)' : 'จำนวนวิดีโอ'}
              options={COUNT_OPTIONS}
              theme={theme}
              accent={accent}
              value={settings.outputCount}
              onChange={(value) => {
                if (multiScene) return;
                onChange('outputCount', String(value));
              }}
            />
          </View>
          <OptionGroup
            columns={9}
            compact
            label="จำนวนฉาก"
            options={SCENE_OPTIONS}
            theme={theme}
            accent={accent}
            value={settings.sceneCount}
            onChange={(value) => {
              onChange('sceneCount', String(value));
              if (parseInt(String(value), 10) > 1) onChange('outputCount', '1');
            }}
          />
        </View>
      </SettingsSection>

      {/* 2. ตัวละคร */}
      <SettingsSection
        color={accent}
        icon={Bot}
        theme={theme}
        title="ตัวละคร"
        onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.character)}
      >
        <OptionGroup
          columns={2}
          options={VIDEO_CHARACTER_MODE_OPTIONS}
          theme={theme}
          accent={accent}
          value={settings.characterMode}
          onChange={(value) => onChange('characterMode', String(value))}
        />
      </SettingsSection>

      {/* 3. การสร้าง Prompt */}
      <SettingsSection
        color={accent}
        icon={Sparkles}
        theme={theme}
        title="การสร้าง Prompt"
        onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.prompt)}
      >
        <View className="gap-2">
          <OptionGroup
            options={VIDEO_PROMPT_MODE_OPTIONS}
            theme={theme}
            accent={accent}
            value={settings.promptMode}
            onChange={(value) => onChange('promptMode', String(value) as AutoPilotPromptMode)}
          />
          {settings.promptMode === 'custom' ? (
            <ManualPromptInput
              value={settings.customPrompt}
              onChangeText={(value) => onChange('customPrompt', value)}
              placeholder="กรอก prompt สำหรับวิดีโอของคุณเอง เช่น A dynamic video showcasing a product with smooth camera movements..."
              theme={theme}
              accent={accent}
            />
          ) : null}
        </View>
      </SettingsSection>

      {settings.promptMode === 'auto' ? (
        <>
          {/* 4. สไตล์วิดีโอ */}
          <SettingsSection
            color={accent}
            icon={Star}
            theme={theme}
            title="สไตล์วิดีโอ"
            onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.style)}
          >
            <View className="gap-2.5">
              <CardOptionGrid
                options={VIDEO_STYLE_OPTIONS}
                theme={theme}
                accent={accent}
                value={settings.presetStyle}
                onChange={(value) => onChange('presetStyle', value)}
              />
              <UserPresetGridLite
                theme={theme}
                accent={accent}
                value={settings.presetStyle}
                onChange={(value) => onChange('presetStyle', value)}
                customValue={settings.presetStyleCustom}
                onCustomChange={(value) => onChange('presetStyleCustom', value)}
                customPlaceholder="พิมพ์สไตล์วิดีโอที่ต้องการ..."
              />
            </View>
          </SettingsSection>

          {/* 5. เสียงพากย์ */}
          <View className="gap-1.5">
            <FieldHeader label="เสียงพากย์" onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.voice)} />
            <CardOptionGrid
              options={VOICE_OPTIONS}
              theme={theme}
              accent={accent}
              value={settings.voiceCharacter}
              onChange={(value) => {
                onChange('voiceCharacter', value);
                if (value === 'none') onChange('dialogueMode', 'none');
              }}
            />
            {settings.voiceCharacter === '__custom__' ? (
              <SettingInput
                placeholder="พิมพ์ลักษณะเสียงพูด..."
                theme={theme}
                value={settings.voiceCharacterCustom}
                onChangeText={(value) => onChange('voiceCharacterCustom', value)}
              />
            ) : null}
            <UserPresetGridLite
              builtInOptions={[]}
              theme={theme}
              accent={accent}
              value={settings.voiceCharacter}
              onChange={(value) => onChange('voiceCharacter', value)}
            />
          </View>

          {/* 6. บทพูด */}
          <View className="gap-1.5">
            <FieldHeader label="บทพูด" onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.dialogue)} />
            <CardOptionGrid
              columns={3}
              options={DIALOGUE_MODE_OPTIONS}
              theme={theme}
              accent={accent}
              value={settings.dialogueMode}
              onChange={(value) => {
                onChange('dialogueMode', value as AutoPilotVideoSettings['dialogueMode']);
                if (value === 'none') onChange('voiceCharacter', 'none');
              }}
            />
            {settings.dialogueMode === 'custom' ? (
              <View className="gap-1.5">
                <View className="flex-row items-center justify-between">
                  <OptionGroup
                    options={DIALOGUE_ORDER_OPTIONS}
                    theme={theme}
                    accent={accent}
                    value={settings.dialogueListOrder}
                    onChange={(value) =>
                      onChange('dialogueListOrder', value as AutoPilotVideoSettings['dialogueListOrder'])
                    }
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => updateDialogueList([...dialogueList, ''])}
                    className="ml-2 flex-row items-center gap-0.5 rounded-kd-md border border-dashed border-kd-border px-2 py-1"
                  >
                    <Plus size={11} color={theme.textSubtle} strokeWidth={2.4} />
                    <Text className="text-[10px] font-semibold text-kd-text-subtle">เพิ่ม</Text>
                  </Pressable>
                </View>
                {dialogueList.map((line, index) => (
                  <View key={index} className="relative">
                    <Input
                      value={line}
                      onChangeText={(value) => {
                        const next = [...dialogueList];
                        next[index] = value;
                        updateDialogueList(next);
                      }}
                      placeholder={multiScene ? 'คั่นฉากด้วย | เช่น สวัสดีค่ะ|สั่งซื้อเลย' : 'พิมพ์บทพูด...'}
                      placeholderTextColor={theme.textSubtle}
                      className={`min-h-9 rounded-kd-md border border-kd-border bg-kd-input px-2 py-1.5 text-kd-caption text-kd-text ${dialogueList.length > 1 ? 'pr-7' : ''}`}
                      style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
                    />
                    {dialogueList.length > 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="ลบบทพูด"
                        onPress={() => updateDialogueList(dialogueList.filter((_, i) => i !== index))}
                        className="absolute right-1.5 top-0 bottom-0 justify-center"
                      >
                        <X size={13} color={theme.textSubtle} strokeWidth={2.2} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {/* 7. สไตล์บทพูด */}
          {settings.dialogueMode !== 'none' ? (
            <View className="gap-1.5">
              <FieldHeader label="สไตล์บทพูด" onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.scriptStyle)} />
              <CardOptionGrid
                options={SCRIPT_STYLE_OPTIONS}
                theme={theme}
                accent={accent}
                value={settings.scriptStyle}
                onChange={(value) => onChange('scriptStyle', value)}
              />
              {settings.scriptStyle === '__custom__' ? (
                <SettingInput
                  placeholder="พิมพ์สไตล์การพูดที่ต้องการ..."
                  theme={theme}
                  value={settings.scriptStyleCustom}
                  onChangeText={(value) => onChange('scriptStyleCustom', value)}
                />
              ) : null}
              <UserPresetGridLite
                builtInOptions={[]}
                theme={theme}
                accent={accent}
                value={settings.scriptStyle}
                onChange={(value) => onChange('scriptStyle', value)}
              />
            </View>
          ) : null}

          {/* 8. เสียงดนตรีและเอฟเฟค */}
          <View className="gap-1.5">
            <FieldHeader label="เสียงดนตรีและเอฟเฟค" onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.musicSfx)} />
            <CardOptionGrid
              columns={3}
              options={MUSIC_SFX_MODE_OPTIONS}
              theme={theme}
              accent={accent}
              value={settings.musicSfxMode}
              onChange={(value) => onChange('musicSfxMode', value as AutoPilotVideoSettings['musicSfxMode'])}
            />
            {settings.musicSfxMode === 'custom' ? (
              <SettingInput
                placeholder="เช่น เพลงป๊อปสนุกสนาน, เสียงกระดิ่ง, เสียงธรรมชาติ..."
                theme={theme}
                value={settings.musicSfxCustom}
                onChangeText={(value) => onChange('musicSfxCustom', value)}
              />
            ) : null}
          </View>

          {/* 9. การเคลื่อนกล้อง */}
          <View className="gap-1.5">
            <FieldHeader label="การเคลื่อนกล้อง" onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.camera)} />
            <CardOptionGrid
              options={CAMERA_OPTIONS}
              theme={theme}
              accent={accent}
              value={settings.cameraMotion}
              onChange={(value) => onChange('cameraMotion', value)}
            />
            {settings.cameraMotion === '__custom__' ? (
              <SettingInput
                placeholder="พิมพ์การเคลื่อนกล้องที่ต้องการ..."
                theme={theme}
                value={settings.cameraMotionCustom}
                onChangeText={(value) => onChange('cameraMotionCustom', value)}
              />
            ) : null}
          </View>

          {/* 10. คำสั่งเพิ่มเติม */}
          <SettingsSection
            color={accent}
            icon={Settings2}
            theme={theme}
            title="คำสั่งเพิ่มเติม"
            onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.additional)}
          >
            <SettingInput
              multiline
              placeholder="เช่น เน้นภาพเคลื่อนไหวช้าๆ, ไม่ใส่เสียงดนตรี..."
              theme={theme}
              value={settings.systemPrompt}
              onChangeText={(value) => onChange('systemPrompt', value)}
            />
          </SettingsSection>

          {/* 11. คำต้องห้าม */}
          <SettingsSection
            color={accent}
            icon={Ban}
            theme={theme}
            title="คำต้องห้าม"
            onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.forbidden)}
          >
            <SettingInput
              placeholder="เช่น ถูกที่สุด, อันดับ 1, การันตี (คั่นด้วย , หรือ เว้นวรรค)"
              theme={theme}
              value={settings.forbiddenWords}
              onChangeText={(value) => onChange('forbiddenWords', value)}
            />
          </SettingsSection>
        </>
      ) : null}
    </View>
  );
}
