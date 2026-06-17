import { View } from 'react-native';
import { Bot, Image as ImageIcon, Settings2, SlidersHorizontal, Sparkles, Star } from 'lucide-react-native';

import type { AutoPilotImageSettings, AutoPilotImageStyleMode, AutoPilotPromptMode } from '@/autopilot/types';
import {
  ASPECT_RATIO_OPTIONS,
  CHARACTER_OUTFIT_OPTIONS,
  CUSTOM_STYLE_OPTIONS,
  FRAME_OPTIONS,
  IMAGE_PROMPT_MODE_OPTIONS,
  IMAGE_STYLE_MODE_OPTIONS,
  LIGHTING_OPTIONS,
  LOCATION_OPTIONS,
  OUTPUT_COUNT_VALUES,
  PRESET_OPTIONS,
  PRESET_TABS,
  PRODUCT_DISPLAY_OPTIONS,
  TEXT_OVERLAY_OPTIONS,
  VIRAL_OPTIONS,
  VIRAL_TABS,
} from '@/autopilot/optionSets';
import type { KubdeeTheme } from '@/theme/tokens';

import { IMAGE_SECTION_KEYS } from '../constants';
import { FieldHeader, OptionGroup, SettingInput, SettingsSection } from '../primitives';
import { CardOptionGrid, CategoryTabs } from './CardOptionGrid';
import { CharacterPicker, ScenePicker } from './CharacterPicker';
import { ManualPromptInput } from './ManualPromptInput';
import { UserPresetGridLite } from './UserPresetGridLite';

const COUNT_OPTIONS = OUTPUT_COUNT_VALUES.map((count) => ({ label: count, value: count }));

export function ImageProductSettingsForm({
  settings,
  theme,
  onApplySection,
  onChange,
}: {
  settings: AutoPilotImageSettings;
  theme: KubdeeTheme;
  onApplySection: (keys: Array<keyof AutoPilotImageSettings>) => void;
  onChange: <K extends keyof AutoPilotImageSettings>(key: K, value: AutoPilotImageSettings[K]) => void;
}): React.JSX.Element {
  const accent = theme.amber;

  // ชุดของตัวละคร + ข้อความในภาพ — ใช้ซ้ำใน AI mode และทุก styleMode
  const OutfitBlock = (): React.JSX.Element => (
    <View className="gap-1.5">
      <FieldHeader label="ชุดของตัวละคร" />
      <CardOptionGrid
        columns={3}
        options={CHARACTER_OUTFIT_OPTIONS}
        theme={theme}
        accent={accent}
        value={settings.characterOutfit}
        onChange={(value) => onChange('characterOutfit', value)}
      />
      {settings.characterOutfit === 'custom' ? (
        <SettingInput
          placeholder="พิมพ์ชุดที่ต้องการ เช่น ชุดกีฬา, ชุดทำงาน..."
          theme={theme}
          value={settings.characterOutfitCustom}
          onChangeText={(value) => onChange('characterOutfitCustom', value)}
        />
      ) : null}
    </View>
  );

  const TextOverlayBlock = (): React.JSX.Element => (
    <View className="gap-1.5">
      <FieldHeader label="ข้อความในภาพ" />
      <CardOptionGrid
        columns={3}
        options={TEXT_OVERLAY_OPTIONS}
        theme={theme}
        accent={accent}
        value={settings.textOverlay}
        onChange={(value) => onChange('textOverlay', value)}
      />
      {settings.textOverlay === 'custom' ? (
        <SettingInput
          placeholder="พิมพ์ข้อความที่ต้องการในภาพ..."
          theme={theme}
          value={settings.textOverlayCustom}
          onChangeText={(value) => onChange('textOverlayCustom', value)}
        />
      ) : null}
    </View>
  );

  return (
    <View className="gap-5">
      {/* 1. ตั้งค่าพื้นฐาน */}
      <SettingsSection
        color={accent}
        icon={SlidersHorizontal}
        theme={theme}
        title="ตั้งค่าพื้นฐาน"
        onApplyAll={() => onApplySection(IMAGE_SECTION_KEYS.basic)}
      >
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
            label="จำนวน"
            options={COUNT_OPTIONS}
            theme={theme}
            accent={accent}
            value={settings.outputCount}
            onChange={(value) => onChange('outputCount', String(value))}
          />
        </View>
      </SettingsSection>

      {/* 2. ตัวละคร */}
      <SettingsSection
        color={accent}
        icon={Bot}
        theme={theme}
        title="ตัวละคร"
        onApplyAll={() => onApplySection(IMAGE_SECTION_KEYS.character)}
      >
        <CharacterPicker
          mode={settings.characterMode}
          onModeChange={(value) => onChange('characterMode', value)}
          description={settings.characterDescription}
          onDescriptionChange={(value) => onChange('characterDescription', value)}
          theme={theme}
          accent={accent}
        />
      </SettingsSection>

      {/* 3. การสร้าง Prompt */}
      <SettingsSection
        color={accent}
        icon={Sparkles}
        theme={theme}
        title="การสร้าง Prompt"
        onApplyAll={() => onApplySection(IMAGE_SECTION_KEYS.prompt)}
      >
        <View className="gap-2">
          <OptionGroup
            options={IMAGE_PROMPT_MODE_OPTIONS}
            theme={theme}
            accent={accent}
            value={settings.promptMode}
            onChange={(value) => onChange('promptMode', String(value) as AutoPilotPromptMode)}
          />
          {settings.promptMode === 'custom' ? (
            <ManualPromptInput
              value={settings.customPrompt}
              onChangeText={(value) => onChange('customPrompt', value)}
              placeholder="กรอก prompt ของคุณเอง เช่น A product photo of a smartphone on a white background with soft lighting..."
              theme={theme}
              accent={accent}
            />
          ) : null}
        </View>
      </SettingsSection>

      {/* 4. AI mode: ชุดของตัวละคร + ข้อความในภาพ */}
      {settings.promptMode === 'ai' ? (
        <View className="gap-4">
          <OutfitBlock />
          <TextOverlayBlock />
        </View>
      ) : null}

      {/* 5. สไตล์รูปภาพ — เฉพาะ Auto Prompt */}
      {settings.promptMode === 'auto' ? (
        <SettingsSection
          color={accent}
          icon={Star}
          theme={theme}
          title="สไตล์รูปภาพ"
          onApplyAll={() => onApplySection(IMAGE_SECTION_KEYS.style)}
        >
          <View className="gap-2.5">
            <OptionGroup
              options={IMAGE_STYLE_MODE_OPTIONS}
              theme={theme}
              accent={accent}
              value={settings.styleMode}
              onChange={(value) => onChange('styleMode', String(value) as AutoPilotImageStyleMode)}
            />

            {/* preset */}
            {settings.styleMode === 'preset' ? (
              <View className="gap-2.5">
                <CategoryTabs
                  tabs={PRESET_TABS}
                  theme={theme}
                  accent={accent}
                  value={settings.presetSubTab}
                  onChange={(key) => onChange('presetSubTab', key)}
                />
                <CardOptionGrid
                  options={PRESET_OPTIONS[settings.presetSubTab] ?? PRESET_OPTIONS.core}
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
                  customPlaceholder="พิมพ์สไตล์รูปภาพที่ต้องการ..."
                />
                <OutfitBlock />
                <TextOverlayBlock />
              </View>
            ) : null}

            {/* custom */}
            {settings.styleMode === 'custom' ? (
              <View className="gap-2.5">
                <View className="gap-1.5">
                  <FieldHeader label="สไตล์ภาพ" />
                  <CardOptionGrid
                    options={CUSTOM_STYLE_OPTIONS}
                    theme={theme}
                    accent={accent}
                    value={settings.customStyle}
                    onChange={(value) => onChange('customStyle', value)}
                  />
                  {settings.customStyle === '__custom__' ? (
                    <SettingInput
                      placeholder="เช่น cozy creator, premium studio"
                      theme={theme}
                      value={settings.presetStyleCustom}
                      onChangeText={(value) => onChange('presetStyleCustom', value)}
                    />
                  ) : null}
                </View>
                <View className="gap-1.5">
                  <FieldHeader label="การแสดงสินค้า" />
                  <CardOptionGrid
                    columns={5}
                    options={PRODUCT_DISPLAY_OPTIONS}
                    theme={theme}
                    accent={accent}
                    value={settings.productDisplayMode}
                    onChange={(value) => onChange('productDisplayMode', value)}
                  />
                </View>
                <View className="gap-1.5">
                  <FieldHeader label="การจัดแสง" />
                  <CardOptionGrid
                    options={LIGHTING_OPTIONS}
                    theme={theme}
                    accent={accent}
                    value={settings.lighting}
                    onChange={(value) => onChange('lighting', value)}
                  />
                  {settings.lighting === '__custom__' ? (
                    <SettingInput
                      placeholder="เช่น soft window light, cinematic warm light"
                      theme={theme}
                      value={settings.lightingCustom}
                      onChangeText={(value) => onChange('lightingCustom', value)}
                    />
                  ) : null}
                </View>
                <View className="gap-1.5">
                  <FieldHeader label="มุมกล้อง" />
                  <CardOptionGrid
                    options={FRAME_OPTIONS}
                    theme={theme}
                    accent={accent}
                    value={settings.frame}
                    onChange={(value) => onChange('frame', value)}
                  />
                  {settings.frame === '__custom__' ? (
                    <SettingInput
                      placeholder="เช่น hero close-up with product in hand"
                      theme={theme}
                      value={settings.frameCustom}
                      onChangeText={(value) => onChange('frameCustom', value)}
                    />
                  ) : null}
                </View>
                <OutfitBlock />
                <TextOverlayBlock />
              </View>
            ) : null}

            {/* viral */}
            {settings.styleMode === 'viral' ? (
              <View className="gap-2.5">
                <CategoryTabs
                  tabs={VIRAL_TABS}
                  theme={theme}
                  accent={accent}
                  value={settings.viralSubTab}
                  onChange={(key) => onChange('viralSubTab', key)}
                />
                <CardOptionGrid
                  options={VIRAL_OPTIONS[settings.viralSubTab] ?? VIRAL_OPTIONS.survival}
                  theme={theme}
                  accent={accent}
                  value={settings.viralStyle}
                  onChange={(value) => onChange('viralStyle', value)}
                />
                <OutfitBlock />
                <TextOverlayBlock />
              </View>
            ) : null}
          </View>
        </SettingsSection>
      ) : null}

      {/* 6. ฉาก — เฉพาะ Auto Prompt */}
      {settings.promptMode === 'auto' ? (
        <SettingsSection
          color={accent}
          icon={ImageIcon}
          theme={theme}
          title="ฉาก"
          onApplyAll={() => onApplySection(IMAGE_SECTION_KEYS.scene)}
        >
          <View className="gap-2.5">
            <ScenePicker
              mode={settings.sceneMode}
              onModeChange={(value) => onChange('sceneMode', value)}
              description={settings.sceneDescription}
              onDescriptionChange={(value) => onChange('sceneDescription', value)}
              theme={theme}
              accent={accent}
            />
            <View className="gap-1.5">
              <FieldHeader label="สถานที่ / ฉากหลัง" />
              <CardOptionGrid
                options={LOCATION_OPTIONS}
                theme={theme}
                accent={accent}
                value={settings.background}
                onChange={(value) => onChange('background', value)}
              />
              {settings.background === '__custom__' ? (
                <SettingInput
                  placeholder="เช่น ห้องนั่งเล่นแสงเช้า, โต๊ะขายของ"
                  theme={theme}
                  value={settings.backgroundCustom}
                  onChangeText={(value) => onChange('backgroundCustom', value)}
                />
              ) : null}
            </View>
          </View>
        </SettingsSection>
      ) : null}

      {/* 7. คำสั่งเพิ่มเติม */}
      <SettingsSection
        color={accent}
        icon={Settings2}
        theme={theme}
        title="คำสั่งเพิ่มเติม"
        onApplyAll={() => onApplySection(IMAGE_SECTION_KEYS.additional)}
      >
        <SettingInput
          multiline
          placeholder="เช่น ห้ามมีข้อความบนภาพ"
          theme={theme}
          value={settings.systemPrompt}
          onChangeText={(value) => onChange('systemPrompt', value)}
        />
      </SettingsSection>
    </View>
  );
}
