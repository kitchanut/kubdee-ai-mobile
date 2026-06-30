import { useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import {
  Eye,
  EyeOff,
  ImagePlus,
  Pencil,
  Plus,
  Presentation,
  Trash2,
  Upload,
  User,
} from 'lucide-react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import Text from '@/components/ui/KubdeeText';
import { useCreativeLibrary } from '@/library/CreativeLibraryContext';
import type { CreativeAssetKind, CreativeLibraryItem } from '@/library/CreativeLibraryContext';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';

import {
  CardBackdrop,
  DarkActionButton,
  EmptyState,
  LibraryPanelHeader,
  darkButtonContentColor,
  getAccentTone,
  libraryCardStops,
} from './shared';

export type SimpleListKind = CreativeAssetKind;

interface EditDraft {
  id: string | null;
  name: string;
  description: string;
  imageUri: string;
}

const panelCopy: Record<SimpleListKind, { title: string; emptyTitle: string; emptyCopy: string; defaultName: string }> = {
  characters: {
    title: 'คลังตัวละคร',
    emptyTitle: 'ยังไม่มีตัวละคร',
    emptyCopy: 'กดปุ่มเพิ่มแล้วแนบรูปตัวละครไว้ใช้ใน Auto Pilot',
    defaultName: 'ตัวละครใหม่',
  },
  scenes: {
    title: 'คลังฉาก',
    emptyTitle: 'ยังไม่มีฉาก',
    emptyCopy: 'กดปุ่มเพิ่มแล้วแนบรูปฉากไว้ใช้ใน Auto Pilot',
    defaultName: 'ฉากใหม่',
  },
};

const kindPalette: Record<SimpleListKind, { avatarStops: [string, string]; avatarIcon: string }> = {
  characters: {
    avatarStops: ['#ede9fe', '#f3e8ff'],
    avatarIcon: '#a78bfa',
  },
  scenes: {
    avatarStops: ['#cffafe', '#e0f2fe'],
    avatarIcon: '#06b6d4',
  },
};

function createId(kind: SimpleListKind): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getPickedImageExtension(uri: string, fileName?: string | null): string {
  const source = fileName || uri.split('?')[0]?.split('/').pop() || '';
  const match = source.match(/\.([a-z0-9]{2,5})$/i);
  const ext = match?.[1]?.toLowerCase();
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
}

async function copyPickedImageToLibrary(
  uri: string,
  kind: SimpleListKind,
  fileName?: string | null
): Promise<string> {
  if (!FileSystem.documentDirectory) {
    throw new Error('ไม่พบพื้นที่จัดเก็บของแอป');
  }

  const directory = `${FileSystem.documentDirectory}creative-library/${kind}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  const extension = getPickedImageExtension(uri, fileName);
  const targetUri = `${directory}${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  await FileSystem.copyAsync({ from: uri, to: targetUri });
  return targetUri;
}

export default function SimpleListPanel({
  theme,
  kind,
  selectedProfileId,
}: {
  theme: KubdeeTheme;
  kind: SimpleListKind;
  selectedProfileId: string;
}): React.JSX.Element {
  const copy = panelCopy[kind];
  const accentColor = kind === 'characters' ? (theme.isDark ? '#a78bfa' : '#7c3aed') : theme.cyan;
  const accent = getAccentTone(theme, accentColor);
  const HeaderIcon = kind === 'characters' ? User : Presentation;
  const { deleteLibraryItems, getLibraryItems, saveLibraryItem } = useCreativeLibrary();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [isPickingImage, setIsPickingImage] = useState(false);

  const items = useMemo(
    () => getLibraryItems(kind, selectedProfileId),
    [getLibraryItems, kind, selectedProfileId]
  );

  const openCreate = (): void => {
    setDraft({
      id: null,
      name: copy.defaultName,
      description: '',
      imageUri: '',
    });
  };

  const openEdit = (item: CreativeLibraryItem): void => {
    setDraft({
      id: item.id,
      name: item.name,
      description: item.description ?? '',
      imageUri: item.imageUri ?? '',
    });
  };

  const closeDraft = (): void => setDraft(null);

  const saveDraft = async (): Promise<CreativeLibraryItem | null> => {
    if (!draft) return null;
    const name = cleanText(draft.name) ?? copy.defaultName;
    const imageUri = cleanText(draft.imageUri);
    if (!imageUri) {
      toast.error(`กรุณาแนบรูป${kind === 'characters' ? 'ตัวละคร' : 'ฉาก'}ก่อนบันทึก`);
      return null;
    }

    const now = Date.now();
    const existingItem = draft.id ? items.find((item) => item.id === draft.id) : null;
    const item = await saveLibraryItem({
      id: draft.id ?? createId(kind),
      kind,
      profileLocalId: selectedProfileId,
      name,
      description: cleanText(draft.description),
      imageUri,
      tags: kind === 'characters' ? 'character,mobile-upload' : 'scene,mobile-upload',
      source: 'mobile-upload',
      createdAt: existingItem?.createdAt ?? now,
    });
    toast.success(draft.id ? 'บันทึกแล้ว' : 'เพิ่มเข้าคลังแล้ว');
    return item;
  };

  const saveAndCloseDraft = async (): Promise<void> => {
    const item = await saveDraft();
    if (item) {
      closeDraft();
    }
  };

  const pickDraftImage = async (): Promise<void> => {
    if (!draft || isPickingImage) return;
    setIsPickingImage(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast.error('กรุณาอนุญาตให้แอปเข้าถึงรูปภาพก่อน');
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
        toast.error('เลือกรูปไม่สำเร็จ');
        return;
      }

      const localUri = await copyPickedImageToLibrary(asset.uri, kind, asset.fileName);
      setDraft((current) => (current ? { ...current, imageUri: localUri } : current));
      toast.success(`แนบรูป${kind === 'characters' ? 'ตัวละคร' : 'ฉาก'}แล้ว`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'แนบรูปไม่สำเร็จ');
    } finally {
      setIsPickingImage(false);
    }
  };

  const toggleEnabled = async (item: CreativeLibraryItem): Promise<void> => {
    await saveLibraryItem({
      ...item,
      enabled: !item.enabled,
    });
  };

  const confirmDelete = (item: CreativeLibraryItem): void => {
    Alert.alert(`ลบ${kind === 'characters' ? 'ตัวละคร' : 'ฉาก'}นี้?`, item.name, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: () => {
          void deleteLibraryItems([item.id]).then(() => toast.success('ลบแล้ว'));
        },
      },
    ]);
  };

  return (
    <View className="flex-1">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 px-3 pb-20 pt-3">
        <LibraryPanelHeader
          theme={theme}
          title={copy.title}
          count={items.length}
          total={items.length}
          icon={HeaderIcon}
          tone={accent}
          actions={
            <DarkActionButton
              theme={theme}
              label="เพิ่ม"
              leading={<Plus size={12} color={darkButtonContentColor(theme)} strokeWidth={2.5} />}
              onPress={openCreate}
            />
          }
        />

        <View className="gap-2">
          {items.map((item) => (
            <SimpleRow
              key={item.id}
              theme={theme}
              kind={kind}
              item={item}
              onToggleEnabled={() => void toggleEnabled(item)}
              onEdit={() => openEdit(item)}
              onDelete={() => confirmDelete(item)}
            />
          ))}
        </View>

        {items.length === 0 ? (
          <EmptyState theme={theme} icon={HeaderIcon} title={copy.emptyTitle} copy={copy.emptyCopy} />
        ) : null}
      </ScrollView>

      <Modal animationType="fade" transparent visible={!!draft} onRequestClose={closeDraft}>
        <View className="flex-1 justify-end bg-black/45">
          <View
            className="gap-3 rounded-t-[20px] border border-kd-border bg-kd-panel p-4"
            style={{ paddingBottom: Math.max(16, insets.bottom + 12) }}
          >
            <Text className="text-kd-title font-semibold text-kd-text">
              {draft?.id ? 'แก้ไข' : 'เพิ่ม'}{kind === 'characters' ? 'ตัวละคร' : 'ฉาก'}
            </Text>
            <TextInput
              value={draft?.name ?? ''}
              onChangeText={(value) => setDraft((current) => (current ? { ...current, name: value } : current))}
              placeholder="ชื่อ"
              placeholderTextColor={theme.textMuted}
              className="h-11 rounded-kd-lg border border-kd-border bg-kd-input px-3 text-kd-body text-kd-text"
              style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
            />
            <TextInput
              value={draft?.description ?? ''}
              onChangeText={(value) => setDraft((current) => (current ? { ...current, description: value } : current))}
              placeholder="รายละเอียดสั้น ๆ เช่น เพศ ช่วงวัย ลุค หรือประเภทฉาก"
              placeholderTextColor={theme.textMuted}
              multiline
              textAlignVertical="top"
              className="min-h-24 rounded-kd-lg border border-kd-border bg-kd-input px-3 py-2 text-kd-body text-kd-text"
              style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
            />
            <View className="gap-2">
              <Pressable
                accessibilityRole="button"
                disabled={isPickingImage}
                onPress={() => void pickDraftImage()}
                className="min-h-24 items-center justify-center overflow-hidden rounded-kd-lg border border-dashed border-kd-border bg-kd-input disabled:opacity-60"
              >
                {draft?.imageUri ? (
                  <Image source={{ uri: draft.imageUri }} className="h-44 w-full" resizeMode="cover" />
                ) : (
                  <View className="items-center gap-2 px-4 py-6">
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-kd-card">
                      <ImagePlus size={20} color={theme.textSubtle} strokeWidth={2} />
                    </View>
                    <Text className="text-kd-body font-semibold text-kd-text">
                      แนบรูป{kind === 'characters' ? 'ตัวละคร' : 'ฉาก'}
                    </Text>
                    <Text className="text-center text-kd-caption text-kd-text-subtle">
                      ใช้รูปจากเครื่องเป็น reference เหมือน Desktop
                    </Text>
                  </View>
                )}
              </Pressable>
              {draft?.imageUri ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={isPickingImage}
                  onPress={() => void pickDraftImage()}
                  className="h-10 flex-row items-center justify-center gap-2 rounded-kd-lg border border-kd-border bg-kd-card disabled:opacity-60"
                >
                  <Upload size={14} color={theme.textSubtle} strokeWidth={2.2} />
                  <Text className="text-kd-caption font-semibold text-kd-text-subtle">เปลี่ยนรูปที่แนบ</Text>
                </Pressable>
              ) : null}
            </View>
            <View className="flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                onPress={closeDraft}
                className="h-11 flex-1 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-card"
              >
                <Text className="text-kd-body font-medium text-kd-text-subtle">ยกเลิก</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void saveAndCloseDraft()}
                className="h-11 flex-1 items-center justify-center rounded-kd-lg bg-kd-text"
              >
                <Text className="text-kd-body font-semibold text-kd-panel">บันทึก</Text>
              </Pressable>
            </View>
        </View>
      </View>
    </Modal>
    </View>
  );
}

function SimpleRow({
  theme,
  kind,
  item,
  onToggleEnabled,
  onEdit,
  onDelete,
}: {
  theme: KubdeeTheme;
  kind: SimpleListKind;
  item: CreativeLibraryItem;
  onToggleEnabled: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const AvatarIcon = kind === 'characters' ? User : Presentation;
  const ToggleIcon = item.enabled ? Eye : EyeOff;
  const palette = kindPalette[kind];
  const avatarStops = theme.isDark ? [theme.cardMuted, theme.card] : palette.avatarStops;
  const avatarIconColor = theme.isDark ? theme.textSubtle : palette.avatarIcon;

  return (
    <View
      className={`overflow-hidden rounded-[12px] border border-[#f3f4f6] bg-kd-panel dark:border-kd-border ${
        item.enabled ? '' : 'opacity-50'
      }`}
      style={{
        elevation: 1,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      }}
    >
      <CardBackdrop theme={theme} id={kind} stops={libraryCardStops[kind]} />

      <View className="flex-row items-center gap-2.5 p-2">
        <View className="h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-[12px] border-2 border-white/50 bg-white/80 dark:border-kd-border-strong/50 dark:bg-kd-card-muted/80">
          {item.imageUri ? (
            <Image source={{ uri: item.imageUri }} className="h-full w-full" resizeMode="cover" />
          ) : (
            <>
              <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
                <Defs>
                  <LinearGradient id={`avatar-grad-${kind}-${item.id}`} x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={avatarStops[0]} />
                    <Stop offset="1" stopColor={avatarStops[1]} />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill={`url(#avatar-grad-${kind}-${item.id})`} />
              </Svg>
              <AvatarIcon size={20} color={avatarIconColor} strokeWidth={1.5} />
            </>
          )}
        </View>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="flex-shrink text-kd-body font-semibold text-kd-text">
              {item.name}
            </Text>
            <View className="rounded-full border border-kd-blue/40 bg-kd-blue/10 px-[5px] py-px dark:border-kd-blue/25 dark:bg-kd-blue/20">
              <Text className="text-[8px] font-semibold text-kd-blue">LOCAL</Text>
            </View>
          </View>
          <Text numberOfLines={1} className="mt-0.5 text-kd-micro text-kd-text-subtle">
            {item.description || 'ยังไม่มีรายละเอียด'}
          </Text>
        </View>

        <View className="flex-shrink-0 flex-row items-center gap-1">
          <Pressable
            accessibilityLabel={item.enabled ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
            accessibilityRole="button"
            onPress={onToggleEnabled}
            className={`h-7 w-7 items-center justify-center rounded-kd-lg ${
              item.enabled ? 'bg-kd-emerald/10 dark:bg-kd-emerald/20' : 'bg-white/50 dark:bg-kd-card-muted/50'
            }`}
          >
            <ToggleIcon size={14} color={item.enabled ? theme.emerald : theme.textSubtle} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityLabel="แก้ไข"
            accessibilityRole="button"
            onPress={onEdit}
            className="h-7 w-7 items-center justify-center rounded-kd-lg bg-white/50 dark:bg-kd-card-muted/50"
          >
            <Pencil size={14} color={theme.textSubtle} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityLabel="ลบ"
            accessibilityRole="button"
            onPress={onDelete}
            className="h-7 w-7 items-center justify-center rounded-kd-lg bg-white/50 dark:bg-kd-card-muted/50"
          >
            <Trash2 size={14} color={theme.textSubtle} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
