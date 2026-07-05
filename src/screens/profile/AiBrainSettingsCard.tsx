import { Gem } from 'lucide-react-native';
import { TouchableOpacity, View } from 'react-native';

import {
  AI_PROVIDER_OPTIONS,
  GEMINI_MODEL_OPTIONS,
  OPENAI_MODEL_OPTIONS,
  type AiBrainSettings,
  type AiProvider,
  type GeminiModel,
  type OpenAIModel,
} from '@/autopilot/aiBrainSettingsStore';
import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';

interface AiBrainSettingsFormProps {
  theme: KubdeeTheme;
  settings: AiBrainSettings;
  onChange: (next: AiBrainSettings) => void;
}

// ฟอร์มตั้งค่า "สมอง AI" (controlled) — mirror จาก kubdee-ai-extension SettingsModal (tab "สมอง")
// parent (MobileSettingsModal) เป็นเจ้าของ draft state และการบันทึกผ่านปุ่ม "บันทึก"
export default function AiBrainSettingsForm({
  theme,
  settings,
  onChange,
}: AiBrainSettingsFormProps): React.JSX.Element {
  const handleSelectProvider = (provider: AiProvider): void => {
    onChange({ ...settings, aiProvider: provider });
  };

  const handleSelectModel = (model: string): void => {
    onChange(
      settings.aiProvider === 'openai'
        ? { ...settings, openaiModel: model as OpenAIModel }
        : { ...settings, geminiModel: model as GeminiModel }
    );
  };

  const modelOptions = settings.aiProvider === 'openai' ? OPENAI_MODEL_OPTIONS : GEMINI_MODEL_OPTIONS;
  const selectedModel = settings.aiProvider === 'openai' ? settings.openaiModel : settings.geminiModel;

  return (
    <>
      {/* AI Provider */}
      <View className="gap-[5px]">
        <Text className="text-kd-micro font-bold text-kd-text-subtle">AI Provider</Text>
        <View className="flex-row gap-1.5">
          {AI_PROVIDER_OPTIONS.map((option) => {
            const selected = option.value === settings.aiProvider;

            return (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected }}
                activeOpacity={0.78}
                key={option.value}
                onPress={() => handleSelectProvider(option.value)}
                className={`h-[30px] flex-1 flex-row items-center justify-center gap-[5px] rounded-kd-lg border px-2.5 ${
                  selected
                    ? 'border-kd-border-strong bg-kd-panel-muted dark:bg-kd-card-muted'
                    : 'border-kd-border bg-kd-card-muted dark:bg-kd-panel-muted'
                }`}
              >
                <Text
                  numberOfLines={1}
                  className={`shrink text-kd-micro font-semibold ${
                    selected ? 'text-kd-text' : 'text-kd-text-subtle'
                  }`}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Model — แต่ละ provider จำ model ของตัวเอง (geminiModel/openaiModel) */}
      <View className="gap-[5px]">
        <Text className="text-kd-micro font-bold text-kd-text-subtle">Model</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {modelOptions.map((option) => {
            const selected = option.value === selectedModel;

            return (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected }}
                activeOpacity={0.78}
                key={option.value}
                onPress={() => handleSelectModel(option.value)}
                className={`h-[30px] max-w-full flex-row items-center gap-[5px] rounded-kd-lg border px-2.5 ${
                  selected
                    ? 'border-kd-border-strong bg-kd-panel-muted dark:bg-kd-card-muted'
                    : 'border-kd-border bg-kd-card-muted dark:bg-kd-panel-muted'
                }`}
              >
                <Text
                  numberOfLines={1}
                  className={`shrink text-kd-micro font-semibold ${
                    selected ? 'text-kd-text' : 'text-kd-text-subtle'
                  }`}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* info note — violet accent ตาม extension ("ใช้เครดิต KUBDEE ของคุณ") */}
      <View className="flex-row items-start gap-2 rounded-kd-lg border border-violet-200 bg-violet-50 px-2.5 py-2 dark:border-violet-800 dark:bg-violet-900/20">
        <View className="mt-px">
          <Gem size={12} color={theme.isDark ? '#a78bfa' : '#7c3aed'} strokeWidth={2.2} />
        </View>
        <Text className="min-w-0 flex-1 text-kd-micro font-medium leading-[15px] text-violet-700 dark:text-violet-300">
          ใช้เครดิต KUBDEE ของคุณ - เข้าสู่ระบบ KUBDEE แล้วใช้งานได้เลย
        </Text>
      </View>
    </>
  );
}
