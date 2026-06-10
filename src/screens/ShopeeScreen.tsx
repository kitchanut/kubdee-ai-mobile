import { Bot, CheckCircle2, Play, Send, Settings, ShoppingBag, StopCircle } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import Text from '@/components/ui/KubdeeText';
import NumberStepper from '@/components/ui/NumberStepper';
import SectionHeader from '@/components/ui/SectionHeader';
import StatusPill from '@/components/ui/StatusPill';
import { createShopeeSearchScript } from '@/automation/scripts/shopeeSearch';
import { startRun } from '@/automation/runner/stateMachine';
import {
  getAccessibilityStatus,
  runShopeeSearch,
} from '@/native/AccessibilityBridge';
import type { KubdeeTheme } from '@/theme/tokens';
import { kubdeeFontFamilies } from '@/theme/fonts';

interface ShopeeScreenProps {
  theme: KubdeeTheme;
  selectedCount: number;
}

export default function ShopeeScreen({ theme, selectedCount }: ShopeeScreenProps): React.JSX.Element {
  const [subMode, setSubMode] = useState<'post' | 'settings'>('post');
  const [keyword, setKeyword] = useState('กระเป๋าเดินทาง');
  const [caption, setCaption] = useState('สินค้าใหม่พร้อมโปรโมชัน');
  const [loops, setLoops] = useState(3);
  const [delay, setDelay] = useState(2);

  const script = useMemo(() => createShopeeSearchScript(keyword.trim() || 'สินค้า'), [keyword]);
  const runState = useMemo(() => startRun(script), [script]);
  const [runMessage, setRunMessage] = useState('พร้อมเปิด Shopee เพื่อเริ่มทดสอบ script');

  const handleStartShopee = async (): Promise<void> => {
    try {
      const keywordValue = keyword.trim() || 'สินค้า';
      const updateRunMessage = (message: string): void => {
        console.log(`[KubdeeShopee] ${message}`);
        setRunMessage(message);
      };
      const status = await getAccessibilityStatus();
      if (!status.running) {
        updateRunMessage('กรุณาเปิด Kubdee AI ใน Accessibility ก่อน');
        return;
      }

      updateRunMessage('ส่ง script ให้ Accessibility service...');
      const started = await runShopeeSearch(keywordValue);
      if (!started) {
        updateRunMessage('เริ่ม native Shopee runner ไม่สำเร็จ');
        return;
      }

      updateRunMessage('native runner เริ่มทำงานแล้ว');
    } catch (error) {
      setRunMessage(String(error));
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <View className="flex-row border-b border-kd-border px-2">
        <SubTab
          active={subMode === 'post'}
          color={theme.orange}
          icon={Send}
          label="โพส"
          theme={theme}
          onPress={() => setSubMode('post')}
        />
        <SubTab
          active={subMode === 'settings'}
          color={theme.textSubtle}
          icon={Settings}
          label="ตั้งค่า"
          theme={theme}
          onPress={() => setSubMode('settings')}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-2 p-2 pb-[18px]">
        {subMode === 'post' ? (
          <>
            <View className="flex-row items-center gap-2.5 rounded-kd-lg border border-kd-orange bg-kd-orange-soft p-3">
              <ShoppingBag size={22} color={theme.orange} strokeWidth={2.2} />
              <View className="min-w-0 flex-1">
                <Text className="text-kd-label font-black text-kd-text">Shopee Automate</Text>
                <Text className="mt-0.5 text-kd-caption leading-[15px] text-kd-text-subtle" numberOfLines={2}>
                  deterministic script สำหรับค้นหาและโพส โดยไม่ให้ AI เลือกกดเอง
                </Text>
              </View>
              <StatusPill
                backgroundColor={theme.emeraldSoft}
                color={theme.emerald}
                icon={CheckCircle2}
                label={`${selectedCount} DEVICE`}
              />
            </View>

            <View className="gap-1.5">
              <SectionHeader icon={Bot} theme={theme} title="Run Config" />
              <LabeledInput
                label="Keyword"
                theme={theme}
                value={keyword}
                onChangeText={setKeyword}
              />
              <LabeledInput
                label="Caption"
                multiline
                theme={theme}
                value={caption}
                onChangeText={setCaption}
              />
              <View className="flex-row gap-2">
                <NumberStepper
                  label="รอบ"
                  max={20}
                  min={1}
                  theme={theme}
                  value={loops}
                  onChange={setLoops}
                />
                <NumberStepper
                  label="Delay"
                  max={12}
                  min={0}
                  suffix="s"
                  theme={theme}
                  value={delay}
                  onChange={setDelay}
                />
              </View>
            </View>

            <View className="flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                disabled={selectedCount === 0}
                onPress={handleStartShopee}
                className="h-[38px] flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-md bg-kd-orange active:opacity-70 disabled:opacity-70"
              >
                <Play size={14} color="#ffffff" fill="#ffffff" />
                <Text className="text-kd-body font-black text-white">เริ่ม Shopee</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                className="h-[38px] flex-row items-center justify-center gap-1.5 rounded-kd-md bg-kd-red-soft px-3.5 active:opacity-70"
              >
                <StopCircle size={14} color={theme.red} />
                <Text className="text-kd-body font-black text-kd-red">หยุด</Text>
              </Pressable>
            </View>
            <Text className="text-center text-kd-caption font-bold leading-4 text-kd-text-subtle">{runMessage}</Text>

            <View className="gap-1.5">
              <SectionHeader icon={Play} theme={theme} title="Steps" />
              {script.steps.map((step, index) => {
                const active = runState.currentStepId === step.id;
                return (
                  <View
                    key={step.id}
                    className={`flex-row items-center gap-2 rounded-kd-md border bg-kd-card p-[9px] ${
                      active ? 'border-kd-orange' : 'border-kd-border'
                    }`}
                  >
                    <View
                      className={`h-6 w-6 items-center justify-center rounded-kd-sm ${
                        active ? 'bg-kd-orange-soft' : 'bg-kd-card-muted'
                      }`}
                    >
                      <Text className={`text-kd-micro font-black ${active ? 'text-kd-orange' : 'text-kd-text-subtle'}`}>
                        {index + 1}
                      </Text>
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="text-kd-body font-extrabold text-kd-text" numberOfLines={1}>
                        {step.label}
                      </Text>
                      <Text className="mt-0.5 text-kd-micro text-kd-text-subtle" numberOfLines={1}>
                        {step.kind}
                      </Text>
                    </View>
                    <StatusPill
                      backgroundColor={active ? theme.orangeSoft : theme.panelMuted}
                      color={active ? theme.orange : theme.textSubtle}
                      label={active ? 'NEXT' : `${step.timeoutMs ?? 0}ms`}
                    />
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <View className="gap-1.5">
            <SectionHeader icon={Settings} theme={theme} title="Shopee Settings" />
            <SettingsRow label="Target package" value="com.shopee.th" theme={theme} />
            <SettingsRow label="Click strategy" value="Accessibility action + gesture fallback" theme={theme} />
            <SettingsRow label="Sensitive step" value="Require user confirmation" theme={theme} />
            <SettingsRow label="OCR fallback" value="Enabled" theme={theme} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SubTab({
  active,
  color,
  icon: Icon,
  label,
  theme,
  onPress,
}: {
  active: boolean;
  color: string;
  icon: typeof Send;
  label: string;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className="-mb-px flex-1 flex-row items-center justify-center gap-1.5 border-b-2 py-2.5"
      // Dynamic prop-driven accent color — className cannot express it.
      style={{ borderBottomColor: active ? color : 'transparent' }}
    >
      <Icon size={14} color={active ? color : theme.textSubtle} strokeWidth={2.2} />
      <Text className="text-kd-body font-extrabold" style={{ color: active ? color : theme.textSubtle }}>
        {label}
      </Text>
    </Pressable>
  );
}

function LabeledInput({
  label,
  multiline = false,
  theme,
  value,
  onChangeText,
}: {
  label: string;
  multiline?: boolean;
  theme: KubdeeTheme;
  value: string;
  onChangeText: (value: string) => void;
}): React.JSX.Element {
  return (
    <View className="gap-[5px]">
      <Text className="text-kd-micro font-extrabold text-kd-text-subtle">{label}</Text>
      <TextInput
        multiline={multiline}
        onChangeText={onChangeText}
        placeholderTextColor={theme.textSubtle}
        className={`rounded-kd-md border border-kd-border bg-kd-input px-2.5 py-2 text-kd-body text-kd-text ${
          multiline ? 'min-h-[74px]' : 'min-h-9'
        }`}
        // TextInput is not KubdeeText — Thai font family has no tailwind token.
        style={
          multiline
            ? { fontFamily: kubdeeFontFamilies.thai.regular, textAlignVertical: 'top' }
            : { fontFamily: kubdeeFontFamilies.thai.regular }
        }
        value={value}
      />
    </View>
  );
}

function SettingsRow({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View className="flex-row gap-2.5 rounded-kd-md border border-kd-border bg-kd-card p-2.5">
      <Text className="min-w-[104px] text-kd-micro font-extrabold text-kd-text-subtle">{label}</Text>
      <Text className="flex-1 text-kd-body font-bold text-kd-text" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}
