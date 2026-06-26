import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Image as ImageIcon, Package, Presentation, Sparkles, User } from 'lucide-react-native';
import { toast } from 'sonner-native';

import {
  DEFAULT_AUTO_PILOT_IMAGE_SETTINGS,
  DEFAULT_AUTO_PILOT_SETTINGS,
  DEFAULT_AUTO_PILOT_VIDEO_SETTINGS,
  IMAGE_ASPECT_RATIO_OPTIONS,
  OUTPUT_COUNT_OPTIONS,
} from '@/autopilot/defaults';
import {
  startGoogleFlowRunner,
  subscribeGoogleFlowRunnerLogs,
} from '@/autopilot/googleFlowRunnerBridge';
import { toAutoPilotProduct } from '@/autopilot/productAdapter';
import type { GoogleFlowRunnerPayload, GoogleFlowRunnerProduct } from '@/autopilot/types';
import { useGeneratedMedia } from '@/autopilot/generatedMediaStore';
import Text from '@/components/ui/KubdeeText';
import {
  buildCreativeImagePrompt,
  createCreativeImageRunnerPayload,
  type CreativeImageKind,
} from '@/creative/creativeImageRunner';
import { useCreativeLibrary } from '@/library/CreativeLibraryContext';
import { useLibrary } from '@/library/LibraryContext';
import type { AffiliateProduct } from '@/library/types';
import type { KubdeeTheme } from '@/theme/tokens';

type ImageMode = 'product' | CreativeImageKind;

const modeOptions: Array<{ id: ImageMode; label: string; icon: typeof Package }> = [
  { id: 'product', label: 'สินค้า', icon: Package },
  { id: 'characters', label: 'ตัวละคร', icon: User },
  { id: 'scenes', label: 'ฉาก', icon: Presentation },
];

function createId(kind: ImageMode): string {
  return `image-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function productImagePrompt(product: AffiliateProduct, customPrompt: string): string {
  const productName = cleanText(product.name) || 'สินค้า';
  const description = cleanText(product.description);
  const custom = cleanText(customPrompt);

  if (custom) {
    return custom;
  }

  return [
    `สร้างรูปสินค้าแนวตั้งสำหรับขายบน TikTok Shop / Shopee ชื่อสินค้า "${productName}"`,
    description ? `รายละเอียดสินค้า: ${description}` : '',
    'ให้สินค้าเป็นจุดเด่น เห็นรายละเอียดชัด มีแสงสวย องค์ประกอบสะอาด ดูน่าเชื่อถือและเหมาะกับคอนเทนต์ขายของบนมือถือ',
    'ถ้ามีรูป reference ให้รักษารูปทรง สี แพ็กเกจ และรายละเอียดสินค้าให้ตรงที่สุด',
    'ห้ามใส่ข้อความ ลายน้ำ subtitle โลโก้ปลอม หรือกรอบภาพ',
  ]
    .filter(Boolean)
    .join('\n');
}

function createProductImagePayload({
  aspectRatio,
  customPrompt,
  outputCount,
  product,
  profileLocalId,
}: {
  aspectRatio: string;
  customPrompt: string;
  outputCount: string;
  product: AffiliateProduct;
  profileLocalId: string;
}): GoogleFlowRunnerPayload {
  const autoProduct = toAutoPilotProduct(product);
  const prompt = productImagePrompt(product, customPrompt);
  const runnerProduct: GoogleFlowRunnerProduct = {
    ...autoProduct,
    settings: {
      image: {
        ...DEFAULT_AUTO_PILOT_IMAGE_SETTINGS,
        aspectRatio,
        outputCount,
        promptMode: 'custom',
        customPrompt: prompt,
      },
      video: { ...DEFAULT_AUTO_PILOT_VIDEO_SETTINGS },
    },
    prompts: { image: prompt },
  };

  return {
    sourceApp: 'mobile',
    runner: 'on-device-google-flow-webview',
    version: 1,
    profileLocalId,
    runId: `image-product-${Date.now()}`,
    enabledSteps: ['image'],
    settings: {
      ...DEFAULT_AUTO_PILOT_SETTINGS,
      totalRounds: 1,
      flowImageModel: DEFAULT_AUTO_PILOT_IMAGE_SETTINGS.imageModel,
    },
    products: [runnerProduct],
    promptCatalogVersion: null,
    promptCatalogSource: 'seed',
    createdAt: Date.now(),
  };
}

export default function ImageCreateScreen({
  selectedProfileId,
  theme,
}: {
  selectedProfileId: string;
  theme: KubdeeTheme;
}): React.JSX.Element {
  const { addGeneratedMediaAsset } = useGeneratedMedia();
  const { products } = useLibrary();
  const { saveLibraryItem } = useCreativeLibrary();
  const [mode, setMode] = useState<ImageMode>('product');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [outputCount, setOutputCount] = useState('1');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [referenceUri, setReferenceUri] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const activeRunIdRef = useRef<string | null>(null);

  const profileProducts = useMemo(
    () => products.filter((product) => product.profileLocalId === selectedProfileId),
    [products, selectedProfileId]
  );
  const selectedProduct = useMemo(
    () => profileProducts.find((product) => product.localId === selectedProductId) ?? profileProducts[0],
    [profileProducts, selectedProductId]
  );

  useEffect(() => {
    if (!selectedProductId && profileProducts[0]?.localId) {
      setSelectedProductId(profileProducts[0].localId);
    }
  }, [profileProducts, selectedProductId]);

  useEffect(() => {
    const subscription = subscribeGoogleFlowRunnerLogs((entry) => {
      const activeRunId = activeRunIdRef.current;
      if (!activeRunId || entry.runId !== activeRunId || entry.event !== 'asset' || entry.step !== 'image') {
        return;
      }

      if (mode !== 'product') {
        return;
      }

      const product = selectedProduct;
      void addGeneratedMediaAsset({
        kind: 'images',
        runId: activeRunId,
        profileLocalId: selectedProfileId,
        productId: entry.productId || product?.localId || 'unknown',
        productName: entry.productName || product?.name || 'สินค้า',
        productCode: product?.externalProductId || product?.localId || entry.productId || 'unknown',
        productUrl: product?.productUrl || null,
        caption: product?.caption || null,
        hashtags: product?.hashtags || null,
        platform: product?.platform || null,
        fileUri: entry.fileUri,
        fileName: entry.fileName,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        createdAt: entry.createdAt,
      });
    });

    return () => subscription.remove();
  }, [addGeneratedMediaAsset, mode, selectedProfileId, selectedProduct]);

  const startProductImage = async (): Promise<void> => {
    if (!selectedProfileId.trim()) {
      toast.error('กรุณาเลือกโปรไฟล์ก่อน');
      return;
    }
    if (!selectedProduct) {
      toast.error('ยังไม่มีสินค้าในโปรไฟล์นี้');
      return;
    }
    const payload = createProductImagePayload({
      aspectRatio,
      customPrompt,
      outputCount,
      product: selectedProduct,
      profileLocalId: selectedProfileId,
    });
    activeRunIdRef.current = payload.runId;
    const result = await startGoogleFlowRunner(payload);
    if (!result.success) {
      activeRunIdRef.current = null;
      toast.error(result.error || 'เริ่ม Google Flow ไม่สำเร็จ');
      return;
    }
    toast.success('เริ่มสร้างรูปสินค้าแล้ว');
  };

  const startCreativeImage = async (kind: CreativeImageKind): Promise<void> => {
    if (!selectedProfileId.trim()) {
      toast.error('กรุณาเลือกโปรไฟล์ก่อน');
      return;
    }
    const itemName = cleanText(name) || (kind === 'characters' ? 'ตัวละครใหม่' : 'ฉากใหม่');
    const itemDescription = cleanText(description) || null;
    const now = Date.now();
    const item = await saveLibraryItem({
      id: createId(kind),
      kind,
      profileLocalId: selectedProfileId,
      name: itemName,
      description: itemDescription,
      imageUri: cleanText(referenceUri) || null,
      tags: kind === 'characters' ? 'character,google-flow' : 'scene,google-flow',
      source: 'mobile',
      createdAt: now,
    });
    const payload = createCreativeImageRunnerPayload({
      description: item.description,
      imageUri: item.imageUri,
      itemId: item.id,
      kind,
      name: item.name,
      profileLocalId: selectedProfileId,
    });
    activeRunIdRef.current = payload.runId;
    const result = await startGoogleFlowRunner(payload);
    if (!result.success) {
      activeRunIdRef.current = null;
      toast.error(result.error || 'เริ่ม Google Flow ไม่สำเร็จ');
      return;
    }
    toast.success(`เริ่มสร้าง${kind === 'characters' ? 'ตัวละคร' : 'ฉาก'}แล้ว`);
  };

  const start = async (): Promise<void> => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      if (mode === 'product') {
        await startProductImage();
      } else {
        await startCreativeImage(mode);
      }
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <View className="flex-1 bg-kd-panel">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 px-3 pb-24 pt-3">
        <View className="flex-row items-center gap-2">
          <View className="h-10 w-10 items-center justify-center rounded-kd-lg bg-kd-amber/15">
            <ImageIcon size={18} color={theme.amber} strokeWidth={2.2} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-kd-title font-extrabold text-kd-text">สร้างภาพ</Text>
            <Text className="text-kd-caption font-medium text-kd-text-subtle">Google Flow · สินค้า ตัวละคร และฉาก</Text>
          </View>
        </View>

        <View className="flex-row gap-2">
          {modeOptions.map((option) => {
            const active = option.id === mode;
            const Icon = option.icon;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setMode(option.id)}
                className={`h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-lg border ${
                  active ? 'border-kd-text bg-kd-text' : 'border-kd-border bg-kd-card'
                }`}
              >
                <Icon size={14} color={active ? theme.panel : theme.textSubtle} strokeWidth={2.2} />
                <Text className={`text-kd-caption font-extrabold ${active ? 'text-kd-panel' : 'text-kd-text-subtle'}`}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'product' ? (
          <View className="gap-3 rounded-[12px] border border-kd-border bg-kd-card p-3">
            <Text className="text-kd-label font-extrabold text-kd-text">เลือกสินค้า</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {profileProducts.map((product) => {
                const active = product.localId === (selectedProduct?.localId ?? selectedProductId);
                return (
                  <Pressable
                    key={product.localId}
                    onPress={() => setSelectedProductId(product.localId)}
                    className={`w-28 overflow-hidden rounded-kd-lg border bg-kd-panel ${
                      active ? 'border-kd-amber' : 'border-kd-border'
                    }`}
                    style={{ width: 112 }}
                  >
                    <View className="bg-kd-card-muted" style={{ height: 112, width: 112 }}>
                      {product.imageUrl || product.imagePath ? (
                        <Image source={{ uri: product.imageUrl || product.imagePath || '' }} className="h-full w-full" resizeMode="cover" />
                      ) : null}
                    </View>
                    <Text numberOfLines={2} className="p-2 text-kd-micro font-semibold text-kd-text">
                      {product.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {profileProducts.length === 0 ? (
              <Text className="text-kd-caption text-kd-text-subtle">ยังไม่มีสินค้าในโปรไฟล์นี้</Text>
            ) : null}
          </View>
        ) : (
          <View className="gap-3 rounded-[12px] border border-kd-border bg-kd-card p-3">
            <Text className="text-kd-label font-extrabold text-kd-text">
              {mode === 'characters' ? 'ข้อมูลตัวละคร' : 'ข้อมูลฉาก'}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={mode === 'characters' ? 'ชื่อตัวละคร' : 'ชื่อฉาก'}
              placeholderTextColor={theme.textMuted}
              className="h-11 rounded-kd-lg border border-kd-border bg-kd-input px-3 text-kd-body text-kd-text"
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="รายละเอียด / prompt reference"
              placeholderTextColor={theme.textMuted}
              multiline
              textAlignVertical="top"
              className="min-h-28 rounded-kd-lg border border-kd-border bg-kd-input px-3 py-2 text-kd-body text-kd-text"
            />
            <TextInput
              value={referenceUri}
              onChangeText={setReferenceUri}
              placeholder="ลิงก์รูป reference (ถ้ามี)"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              className="h-11 rounded-kd-lg border border-kd-border bg-kd-input px-3 text-kd-body text-kd-text"
            />
            <Text className="text-kd-caption text-kd-text-subtle">
              {buildCreativeImagePrompt(mode, cleanText(name) || (mode === 'characters' ? 'ตัวละครใหม่' : 'ฉากใหม่'), cleanText(description) || null).slice(0, 170)}
            </Text>
          </View>
        )}

        <View className="gap-3 rounded-[12px] border border-kd-border bg-kd-card p-3">
          <Text className="text-kd-label font-extrabold text-kd-text">ตั้งค่ารูปภาพ</Text>
          <View className="flex-row flex-wrap gap-2">
            {IMAGE_ASPECT_RATIO_OPTIONS.map((option) => (
              <Pressable
                key={option}
                onPress={() => setAspectRatio(option)}
                className={`h-8 min-w-[58px] items-center justify-center rounded-kd-md border px-2 ${
                  aspectRatio === option ? 'border-kd-amber bg-kd-amber/10' : 'border-kd-border bg-kd-input'
                }`}
              >
                <Text className="text-kd-caption font-semibold text-kd-text">{option}</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="text-kd-caption font-semibold text-kd-text-subtle">จำนวนรูป</Text>
            {OUTPUT_COUNT_OPTIONS.map((option) => (
              <Pressable
                key={option}
                onPress={() => setOutputCount(option)}
                className={`h-8 w-8 items-center justify-center rounded-full ${
                  outputCount === option ? 'bg-kd-text' : 'bg-kd-input'
                }`}
              >
                <Text className={`text-kd-caption font-extrabold ${outputCount === option ? 'text-kd-panel' : 'text-kd-text'}`}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {mode === 'product' ? (
          <TextInput
            value={customPrompt}
            onChangeText={setCustomPrompt}
            placeholder="Prompt เพิ่มเติมสำหรับรูปสินค้า (ถ้ามี)"
            placeholderTextColor={theme.textMuted}
            multiline
            textAlignVertical="top"
            className="min-h-28 rounded-[12px] border border-kd-border bg-kd-card px-3 py-2 text-kd-body text-kd-text"
          />
        ) : null}
      </ScrollView>

      <View
        className="border-t border-kd-border bg-kd-panel px-3 py-3"
        style={{ bottom: 0, left: 0, position: 'absolute', right: 0 }}
      >
        <Pressable
          accessibilityRole="button"
          disabled={isStarting}
          onPress={() => void start()}
          className="h-12 flex-row items-center justify-center gap-2 rounded-kd-xl bg-kd-text disabled:opacity-60"
        >
          {isStarting ? (
            <ActivityIndicator size="small" color={theme.panel} />
          ) : (
            <Sparkles size={16} color={theme.panel} strokeWidth={2.4} />
          )}
          <Text className="text-kd-label font-extrabold text-kd-panel">เริ่มสร้างภาพ</Text>
        </Pressable>
      </View>
    </View>
  );
}
