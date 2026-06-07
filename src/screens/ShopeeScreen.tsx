import { Bot, CheckCircle2, Play, Send, Settings, ShoppingBag, StopCircle } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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
import { radii, spacing, typography } from '@/theme/tokens';

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
        updateRunMessage('กรุณาเปิด Kubdee Mobile Automation ใน Accessibility ก่อน');
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <View style={[styles.subTabs, { borderBottomColor: theme.border }]}>
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {subMode === 'post' ? (
          <>
            <View style={[styles.hero, { backgroundColor: theme.orangeSoft, borderColor: theme.orange }]}>
              <ShoppingBag size={22} color={theme.orange} strokeWidth={2.2} />
              <View style={styles.heroText}>
                <Text style={[styles.heroTitle, { color: theme.text }]}>Shopee Automate</Text>
                <Text style={[styles.heroSubtitle, { color: theme.textSubtle }]} numberOfLines={2}>
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

            <View style={styles.stack}>
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
              <View style={styles.twoColumns}>
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

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={selectedCount === 0}
                onPress={handleStartShopee}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: theme.orange, opacity: pressed || selectedCount === 0 ? 0.7 : 1 },
                ]}
              >
                <Play size={14} color="#ffffff" fill="#ffffff" />
                <Text style={styles.primaryButtonText}>เริ่ม Shopee</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { backgroundColor: theme.redSoft, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <StopCircle size={14} color={theme.red} />
                <Text style={[styles.secondaryButtonText, { color: theme.red }]}>หยุด</Text>
              </Pressable>
            </View>
            <Text style={[styles.runMessage, { color: theme.textSubtle }]}>{runMessage}</Text>

            <View style={styles.stack}>
              <SectionHeader icon={Play} theme={theme} title="Steps" />
              {script.steps.map((step, index) => {
                const active = runState.currentStepId === step.id;
                return (
                  <View
                    key={step.id}
                    style={[styles.stepRow, { backgroundColor: theme.card, borderColor: active ? theme.orange : theme.border }]}
                  >
                    <View style={[styles.stepNumber, { backgroundColor: active ? theme.orangeSoft : theme.cardMuted }]}>
                      <Text style={[styles.stepNumberText, { color: active ? theme.orange : theme.textSubtle }]}>
                        {index + 1}
                      </Text>
                    </View>
                    <View style={styles.stepBody}>
                      <Text style={[styles.stepLabel, { color: theme.text }]} numberOfLines={1}>
                        {step.label}
                      </Text>
                      <Text style={[styles.stepKind, { color: theme.textSubtle }]} numberOfLines={1}>
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
          <View style={styles.stack}>
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
      style={[styles.subTab, { borderBottomColor: active ? color : 'transparent' }]}
    >
      <Icon size={14} color={active ? color : theme.textSubtle} strokeWidth={2.2} />
      <Text style={[styles.subTabText, { color: active ? color : theme.textSubtle }]}>{label}</Text>
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
    <View style={styles.inputGroup}>
      <Text style={[styles.inputLabel, { color: theme.textSubtle }]}>{label}</Text>
      <TextInput
        multiline={multiline}
        onChangeText={onChangeText}
        placeholderTextColor={theme.textSubtle}
        style={[
          styles.input,
          multiline ? styles.multilineInput : null,
          { backgroundColor: theme.input, borderColor: theme.border, color: theme.text },
        ]}
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
    <View style={[styles.settingsRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.settingsLabel, { color: theme.textSubtle }]}>{label}</Text>
      <Text style={[styles.settingsValue, { color: theme.text }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  container: {
    flex: 1,
  },
  hero: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  heroSubtitle: {
    fontSize: typography.caption,
    lineHeight: 15,
    marginTop: 2,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: typography.label,
    fontWeight: '900',
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    fontSize: typography.body,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputGroup: {
    gap: 5,
  },
  inputLabel: {
    fontSize: typography.micro,
    fontWeight: '800',
  },
  multilineInput: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 38,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: typography.body,
    fontWeight: '900',
  },
  runMessage: {
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  scrollContent: {
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: 18,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 6,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    fontSize: typography.body,
    fontWeight: '900',
  },
  settingsLabel: {
    fontSize: typography.micro,
    fontWeight: '800',
    minWidth: 104,
  },
  settingsRow: {
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  settingsValue: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '700',
  },
  stack: {
    gap: spacing.sm,
  },
  stepBody: {
    flex: 1,
    minWidth: 0,
  },
  stepKind: {
    fontSize: typography.micro,
    marginTop: 2,
  },
  stepLabel: {
    fontSize: typography.body,
    fontWeight: '800',
  },
  stepNumber: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  stepNumberText: {
    fontSize: typography.micro,
    fontWeight: '900',
  },
  stepRow: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 9,
  },
  subTab: {
    alignItems: 'center',
    borderBottomWidth: 2,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginBottom: -1,
    paddingVertical: 10,
  },
  subTabText: {
    fontSize: typography.body,
    fontWeight: '800',
  },
  subTabs: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  twoColumns: {
    flexDirection: 'row',
    gap: 8,
  },
});
