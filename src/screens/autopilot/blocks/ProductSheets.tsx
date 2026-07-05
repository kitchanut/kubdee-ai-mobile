import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { ChevronRight, Check, FolderOpen, Image as ImageIcon, Package, Save, Search, Trash2, X } from 'lucide-react-native';
import { getAutoPilotProductId } from '@/autopilot/productAdapter';
import type { AutoPilotProductPreset } from '@/autopilot/productPresetStore';
import type { AutoPilotSettingsPreset } from '@/autopilot/settingsPresetStore';
import Text from '@/components/ui/KubdeeText';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isDisplayableProductImageUri } from '@/library/productImageCache';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';
import type { AffiliateProduct } from '@/library/types';
import type { AutoPilotProduct } from '@/autopilot/types';
import { formatPrice } from '../constants';

export function ProductSelectSheet({
  bottomInset,
  topInset,
  products,
  selectedProductIds,
  theme,
  onClose,
  onConfirm,
}: {
  bottomInset: number;
  topInset: number;
  products: AffiliateProduct[];
  selectedProductIds: Set<string>;
  theme: KubdeeTheme;
  onClose: () => void;
  onConfirm: (productIds: string[]) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [draftSelectedIds, setDraftSelectedIds] = useState<Set<string>>(
    () => new Set(Array.from(selectedProductIds))
  );

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return products;
    }

    return products.filter((product) =>
      [
        product.name,
        product.externalProductId,
        product.localId,
        product.description,
        product.productUrl,
      ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)
    );
  }, [products, query]);

  const allFilteredSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((product) => draftSelectedIds.has(getAutoPilotProductId(product)));

  const toggleProduct = (productId: string): void => {
    setDraftSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const toggleAllFiltered = (): void => {
    setDraftSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        for (const product of filteredProducts) {
          next.delete(getAutoPilotProductId(product));
        }
        return next;
      }
      for (const product of filteredProducts) {
        next.add(getAutoPilotProductId(product));
      }
      return next;
    });
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View
        className="flex-1 bg-black/60 px-3"
        style={{
          paddingTop: Math.max(topInset + 10, 40),
          paddingBottom: Math.max(bottomInset + 12, 20),
        }}
      >
        <View className="min-h-0 flex-1 overflow-hidden rounded-kd-2xl border border-kd-border bg-kd-panel">
          <View className="border-b border-kd-border bg-kd-card px-3 pt-3">
            <View className="flex-row items-center justify-between pb-2">
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <View className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-emerald-soft dark:bg-kd-card-muted">
                  <Package size={15} color={theme.emerald} strokeWidth={2.1} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-kd-label font-semibold text-kd-text">เลือกจากคลังสินค้า</Text>
                  <Text className="text-kd-micro text-kd-text-subtle">{products.length} รายการในโปรไฟล์นี้</Text>
                </View>
              </View>
              <Button
                accessibilityLabel="ปิดเลือกสินค้าจากคลัง"
                accessibilityRole="button"
                variant="ghost"
                size="icon"
                onPress={onClose}
                className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted"
              >
                <X size={15} color={theme.textMuted} strokeWidth={2.3} />
              </Button>
            </View>

            <View className="pb-3">
              <View className="h-9 flex-row items-center gap-1.5 rounded-kd-md border border-kd-border bg-kd-input px-2">
                <Search size={13} color={theme.textSubtle} strokeWidth={2} />
                <Input
                  value={query}
                  onChangeText={setQuery}
                  placeholder="ค้นหาสินค้า..."
                  placeholderTextColor={theme.textSubtle}
                  className="h-9 flex-1 rounded-none border-0 bg-transparent p-0 text-kd-caption text-kd-text shadow-none dark:bg-transparent"
                  style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
                />
                {query.length > 0 ? (
                  <Pressable accessibilityLabel="ล้างคำค้นหา" accessibilityRole="button" onPress={() => setQuery('')}>
                    <X size={13} color={theme.textSubtle} strokeWidth={2.5} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>

          {filteredProducts.length > 0 ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allFilteredSelected }}
              onPress={toggleAllFiltered}
              className="min-h-10 flex-row items-center justify-between px-3"
            >
              <View className="flex-row items-center gap-2">
                <View pointerEvents="none">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={toggleAllFiltered}
                    checkedClassName="border-kd-emerald"
                    indicatorClassName="bg-kd-emerald"
                    className="h-5 w-5 rounded-kd-md border border-kd-border-strong bg-kd-input"
                  />
                </View>
                <Text className="text-kd-micro font-semibold text-kd-text-subtle">
                  เลือกทั้งหมด ({filteredProducts.length})
                </Text>
              </View>
              <Badge className="border-transparent bg-kd-emerald-soft px-2 dark:bg-kd-card-muted">
                <Text className="text-kd-micro font-medium text-kd-emerald">เลือกแล้ว {draftSelectedIds.size}</Text>
              </Badge>
            </Pressable>
          ) : null}

          <ScrollView
            className="min-h-0 flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerClassName="gap-1.5 p-2 pb-3"
          >
            {filteredProducts.length === 0 ? (
              <View className="items-center gap-2 py-12">
                <Package size={28} color={theme.textSubtle} strokeWidth={1.7} />
                <Text className="text-kd-caption text-kd-text-subtle">
                  {query.trim() ? 'ไม่พบสินค้าที่ค้นหา' : 'ยังไม่มีสินค้าในโปรไฟล์นี้'}
                </Text>
              </View>
            ) : (
              filteredProducts.map((product) => (
                <CatalogSelectRow
                  key={getAutoPilotProductId(product)}
                  product={product}
                  selected={draftSelectedIds.has(getAutoPilotProductId(product))}
                  theme={theme}
                  onPress={() => toggleProduct(getAutoPilotProductId(product))}
                />
              ))
            )}
          </ScrollView>

          <View className="flex-row items-center justify-end gap-2 border-t border-kd-border bg-kd-panel px-3 py-2">
            <Button
              accessibilityRole="button"
              variant="ghost"
              onPress={onClose}
              className="h-10 justify-center rounded-kd-md px-3"
            >
              <Text className="text-kd-caption font-medium text-kd-text-muted">ยกเลิก</Text>
            </Button>
            <Button
              accessibilityRole="button"
              disabled={draftSelectedIds.size === 0}
              variant="ghost"
              onPress={() => onConfirm(Array.from(draftSelectedIds))}
              className={`h-10 flex-row items-center justify-center gap-1.5 rounded-kd-md px-4 ${
                draftSelectedIds.size === 0 ? 'bg-kd-border opacity-60' : 'bg-kd-emerald'
              }`}
            >
              <Check size={14} color={theme.white} strokeWidth={2.4} />
              <Text className="text-kd-caption font-medium text-white">
                เลือก {draftSelectedIds.size > 0 ? `${draftSelectedIds.size} รายการ` : ''}
              </Text>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CatalogSelectRow({
  product,
  selected,
  theme,
  onPress,
}: {
  product: AffiliateProduct;
  selected: boolean;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  const productId = product.externalProductId || product.localId;
  const imageCandidates = useMemo(
    () => Array.from(new Set([product.imagePath, product.imageUrl].filter((uri): uri is string => isDisplayableProductImageUri(uri)))),
    [product.imagePath, product.imageUrl]
  );
  const [failedImageUris, setFailedImageUris] = useState<string[]>([]);
  const imageUri = imageCandidates.find((uri) => !failedImageUris.includes(uri)) ?? null;

  useEffect(() => {
    setFailedImageUris([]);
  }, [product.localId, product.imagePath, product.imageUrl]);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="flex-row items-center gap-2 rounded-kd-lg border p-2"
      style={{
        backgroundColor: selected ? alpha(theme.emerald, theme.isDark ? 0.14 : 0.08) : theme.card,
        borderColor: selected ? alpha(theme.emerald, 0.55) : 'transparent',
      }}
    >
      <View pointerEvents="none">
        <Checkbox
          checked={selected}
          onCheckedChange={onPress}
          checkedClassName="border-kd-emerald"
          indicatorClassName="bg-kd-emerald"
          className="h-5 w-5 rounded-[6px] border-2 border-kd-border-strong bg-kd-input"
        />
      </View>
      <View className="h-12 w-12 overflow-hidden rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted">
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            className="h-full w-full"
            resizeMode="cover"
            onError={() => {
              setFailedImageUris((current) => current.includes(imageUri) ? current : [...current, imageUri]);
            }}
          />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <ImageIcon size={16} color={theme.textSubtle} strokeWidth={1.8} />
          </View>
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-kd-caption font-bold text-kd-text">
          {product.name || 'ไม่มีชื่อ'}
        </Text>
        <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">#{productId}</Text>
        <Text numberOfLines={1} className="text-kd-micro font-semibold text-kd-emerald">
          {formatPrice(product.price)}
        </Text>
      </View>
    </Pressable>
  );
}

export function ProductPresetSheet({
  bottomInset,
  mode,
  name,
  presets,
  saveDisabled,
  selectedCount,
  theme,
  onClose,
  onDelete,
  onLoad,
  onModeChange,
  onNameChange,
  onSave,
}: {
  bottomInset: number;
  mode: 'save' | 'load';
  name: string;
  presets: AutoPilotProductPreset[];
  saveDisabled: boolean;
  selectedCount: number;
  theme: KubdeeTheme;
  onClose: () => void;
  onDelete: (preset: AutoPilotProductPreset) => void;
  onLoad: (preset: AutoPilotProductPreset) => void;
  onModeChange: (mode: 'save' | 'load') => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
}): React.JSX.Element {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View className="flex-1 justify-end bg-black/60">
        <View
          className="mx-3 overflow-hidden rounded-kd-2xl border border-kd-border bg-kd-panel"
          style={{ maxHeight: '72%', marginBottom: Math.max(bottomInset + 12, 20) }}
        >
          <View className="border-b border-kd-border bg-kd-card px-3 pt-3">
            <View className="flex-row items-center justify-between pb-2">
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <View className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-panel-muted dark:bg-kd-card-muted">
                  <FolderOpen size={15} color={theme.textMuted} strokeWidth={2.1} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-kd-label font-semibold text-kd-text">Product Preset</Text>
                  <Text className="text-kd-micro text-kd-text-subtle">บันทึก/โหลดชุดสินค้าที่เลือกจากคลัง</Text>
                </View>
              </View>
              <Button
                accessibilityLabel="ปิด Product Preset"
                accessibilityRole="button"
                variant="ghost"
                size="icon"
                onPress={onClose}
                className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted"
              >
                <X size={15} color={theme.textMuted} strokeWidth={2.3} />
              </Button>
            </View>

            <Tabs
              value={mode}
              onValueChange={(nextMode) => onModeChange(nextMode as 'save' | 'load')}
              className="gap-0"
            >
              <TabsList className="mr-0 h-10 w-full rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="save"
                  className={`min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-none border-0 border-b-2 bg-transparent ${
                    mode === 'save' ? 'border-kd-emerald' : 'border-transparent'
                  }`}
                >
                  <Save size={13} color={mode === 'save' ? theme.emerald : theme.textSubtle} strokeWidth={2.2} />
                  <Text className="text-kd-caption font-medium" style={{ color: mode === 'save' ? theme.emerald : theme.textSubtle }}>
                    บันทึก
                  </Text>
                </TabsTrigger>
                <TabsTrigger
                  value="load"
                  className={`min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-none border-0 border-b-2 bg-transparent ${
                    mode === 'load' ? 'border-kd-emerald' : 'border-transparent'
                  }`}
                >
                  <FolderOpen size={13} color={mode === 'load' ? theme.emerald : theme.textSubtle} strokeWidth={2.2} />
                  <Text className="text-kd-caption font-medium" style={{ color: mode === 'load' ? theme.emerald : theme.textSubtle }}>
                    โหลด
                  </Text>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerClassName="gap-3 px-3 py-3"
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {mode === 'save' ? (
              <View className="gap-3">
                <View className="rounded-kd-lg border border-kd-border bg-kd-card px-3 py-3">
                  <Text className="text-kd-caption font-medium text-kd-text">บันทึกชุดสินค้าที่เลือก</Text>
                  <Text className="mt-0.5 text-kd-micro text-kd-text-subtle">
                    รวมสินค้า {selectedCount} รายการ พร้อม settings รูปภาพ/วิดีโอของแต่ละสินค้า
                  </Text>
                  <View className="mt-3 gap-1.5">
                    <Text className="text-kd-micro font-semibold text-kd-text-subtle">ชื่อ preset</Text>
                    <Input
                      value={name}
                      onChangeText={onNameChange}
                      placeholder="เช่น ชุดรีวิวสินค้า 9:16"
                      placeholderTextColor={theme.textSubtle}
                      className="min-h-10 rounded-kd-md border border-kd-border bg-kd-input px-2 text-kd-caption text-kd-text dark:bg-kd-input"
                      style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
                    />
                  </View>
                </View>
                <Button
                  accessibilityRole="button"
                  disabled={saveDisabled}
                  variant="ghost"
                  onPress={onSave}
                  className={`h-11 flex-row items-center justify-center gap-2 rounded-kd-lg ${
                    saveDisabled ? 'bg-kd-border' : 'bg-kd-text'
                  }`}
                >
                  <Save size={15} color={theme.isDark && !saveDisabled ? '#000000' : theme.white} strokeWidth={2.2} />
                  <Text className={`text-kd-body font-medium ${theme.isDark && !saveDisabled ? 'text-black' : 'text-white'}`}>
                    บันทึก preset
                  </Text>
                </Button>
              </View>
            ) : (
              <View className="gap-2">
                {presets.length === 0 ? (
                  <View className="items-center gap-2 rounded-kd-lg border border-kd-border bg-kd-card py-8">
                    <FolderOpen size={24} color={theme.textSubtle} strokeWidth={1.8} />
                    <Text className="text-kd-caption text-kd-text-subtle">ยังไม่มี Product Preset</Text>
                  </View>
                ) : (
                  presets.map((preset) => (
                    <View key={preset.id} className="flex-row items-stretch gap-1.5">
                      <Button
                        accessibilityRole="button"
                        variant="ghost"
                        onPress={() => onLoad(preset)}
                        className="min-w-0 flex-1 flex-row items-center gap-2 rounded-kd-lg border border-kd-border bg-kd-card px-2 py-2"
                      >
                        <View className="h-10 w-10 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted">
                          <Text className="text-kd-caption font-medium text-kd-text">{preset.productIds.length}</Text>
                        </View>
                        <View className="min-w-0 flex-1">
                          <Text numberOfLines={1} className="text-kd-caption font-medium text-kd-text">{preset.name}</Text>
                          <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
                            {preset.productIds.length} สินค้า · {new Date(preset.createdAt).toLocaleDateString('th-TH')}
                          </Text>
                        </View>
                        <ChevronRight size={15} color={theme.textSubtle} strokeWidth={2.2} />
                      </Button>
                      <Pressable
                        accessibilityLabel={`ลบ preset ${preset.name}`}
                        accessibilityRole="button"
                        onPress={() =>
                          Alert.alert('ลบ preset', `ลบ "${preset.name}" ?`, [
                            { text: 'ยกเลิก', style: 'cancel' },
                            { text: 'ลบ', style: 'destructive', onPress: () => onDelete(preset) },
                          ])
                        }
                        className="w-9 shrink-0 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-card active:bg-kd-panel-muted dark:active:bg-kd-card-muted"
                      >
                        <Trash2 size={14} color={theme.red} strokeWidth={2.1} />
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function SettingsPresetSheet({
  bottomInset,
  mode,
  name,
  presets,
  product,
  saveDisabled,
  theme,
  onClose,
  onDelete,
  onLoad,
  onModeChange,
  onNameChange,
  onSave,
}: {
  bottomInset: number;
  mode: 'save' | 'load';
  name: string;
  presets: AutoPilotSettingsPreset[];
  product: AutoPilotProduct;
  saveDisabled: boolean;
  theme: KubdeeTheme;
  onClose: () => void;
  onDelete: (preset: AutoPilotSettingsPreset) => void;
  onLoad: (preset: AutoPilotSettingsPreset) => void;
  onModeChange: (mode: 'save' | 'load') => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
}): React.JSX.Element {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View className="flex-1 justify-end bg-black/60">
        <View
          className="mx-3 overflow-hidden rounded-kd-2xl border border-kd-border bg-kd-panel"
          style={{ maxHeight: '72%', marginBottom: Math.max(bottomInset + 12, 20) }}
        >
          <View className="border-b border-kd-border bg-kd-card px-3 pt-3">
            <View className="flex-row items-center justify-between pb-2">
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <View className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-panel-muted dark:bg-kd-card-muted">
                  <Save size={15} color={theme.textMuted} strokeWidth={2.1} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-kd-label font-semibold text-kd-text">Preset ตั้งค่า</Text>
                  <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
                    รูปภาพ+วิดีโอของ {product.name || product.productId || 'สินค้า'}
                  </Text>
                </View>
              </View>
              <Button
                accessibilityLabel="ปิด Preset ตั้งค่า"
                accessibilityRole="button"
                variant="ghost"
                size="icon"
                onPress={onClose}
                className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted"
              >
                <X size={15} color={theme.textMuted} strokeWidth={2.3} />
              </Button>
            </View>

            <Tabs
              value={mode}
              onValueChange={(nextMode) => onModeChange(nextMode as 'save' | 'load')}
              className="gap-0"
            >
              <TabsList className="mr-0 h-10 w-full rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="save"
                  className={`min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-none border-0 border-b-2 bg-transparent ${
                    mode === 'save' ? 'border-kd-emerald' : 'border-transparent'
                  }`}
                >
                  <Save size={13} color={mode === 'save' ? theme.emerald : theme.textSubtle} strokeWidth={2.2} />
                  <Text className="text-kd-caption font-medium" style={{ color: mode === 'save' ? theme.emerald : theme.textSubtle }}>
                    บันทึก
                  </Text>
                </TabsTrigger>
                <TabsTrigger
                  value="load"
                  className={`min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-none border-0 border-b-2 bg-transparent ${
                    mode === 'load' ? 'border-kd-emerald' : 'border-transparent'
                  }`}
                >
                  <FolderOpen size={13} color={mode === 'load' ? theme.emerald : theme.textSubtle} strokeWidth={2.2} />
                  <Text className="text-kd-caption font-medium" style={{ color: mode === 'load' ? theme.emerald : theme.textSubtle }}>
                    โหลด
                  </Text>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerClassName="gap-3 px-3 py-3"
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {mode === 'save' ? (
              <View className="gap-3">
                <View className="rounded-kd-lg border border-kd-border bg-kd-card px-3 py-3">
                  <Text className="text-kd-caption font-medium text-kd-text">บันทึก preset ตั้งค่า</Text>
                  <Text className="mt-0.5 text-kd-micro text-kd-text-subtle">
                    เก็บค่ารูปภาพและวิดีโอของสินค้านี้ไว้ใช้ซ้ำกับสินค้าอื่น
                  </Text>
                  <View className="mt-3 gap-1.5">
                    <Text className="text-kd-micro font-semibold text-kd-text-subtle">ชื่อ preset</Text>
                    <Input
                      value={name}
                      onChangeText={onNameChange}
                      placeholder="เช่น รีวิวสั้น 9:16 โทนพรีเมียม"
                      placeholderTextColor={theme.textSubtle}
                      className="min-h-10 rounded-kd-md border border-kd-border bg-kd-input px-2 text-kd-caption text-kd-text dark:bg-kd-input"
                      style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
                    />
                  </View>
                </View>
                <Button
                  accessibilityRole="button"
                  disabled={saveDisabled}
                  variant="ghost"
                  onPress={onSave}
                  className={`h-11 flex-row items-center justify-center gap-2 rounded-kd-lg ${
                    saveDisabled ? 'bg-kd-border' : 'bg-kd-text'
                  }`}
                >
                  <Save size={15} color={theme.isDark && !saveDisabled ? '#000000' : theme.white} strokeWidth={2.2} />
                  <Text className={`text-kd-body font-medium ${theme.isDark && !saveDisabled ? 'text-black' : 'text-white'}`}>
                    บันทึก preset ตั้งค่า
                  </Text>
                </Button>
              </View>
            ) : (
              <View className="gap-2">
                {presets.length === 0 ? (
                  <View className="items-center gap-2 rounded-kd-lg border border-kd-border bg-kd-card py-8">
                    <FolderOpen size={24} color={theme.textSubtle} strokeWidth={1.8} />
                    <Text className="text-kd-caption text-kd-text-subtle">ยังไม่มี Preset ตั้งค่า</Text>
                  </View>
                ) : (
                  presets.map((preset) => (
                    <View key={preset.id} className="flex-row items-stretch gap-1.5">
                      <Button
                        accessibilityRole="button"
                        variant="ghost"
                        onPress={() => onLoad(preset)}
                        className="min-w-0 flex-1 flex-row items-center gap-2 rounded-kd-lg border border-kd-border bg-kd-card px-2 py-2"
                      >
                        <View className="h-10 w-10 items-center justify-center">
                          <Save size={15} color={theme.textMuted} strokeWidth={2.1} />
                        </View>
                        <View className="min-w-0 flex-1">
                          <Text numberOfLines={1} className="text-kd-caption font-medium text-kd-text">{preset.name}</Text>
                          <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
                            รูปภาพ+วิดีโอ · {new Date(preset.createdAt).toLocaleDateString('th-TH')}
                          </Text>
                        </View>
                        <ChevronRight size={15} color={theme.textSubtle} strokeWidth={2.2} />
                      </Button>
                      <Pressable
                        accessibilityLabel={`ลบ preset ${preset.name}`}
                        accessibilityRole="button"
                        onPress={() =>
                          Alert.alert('ลบ preset', `ลบ "${preset.name}" ?`, [
                            { text: 'ยกเลิก', style: 'cancel' },
                            { text: 'ลบ', style: 'destructive', onPress: () => onDelete(preset) },
                          ])
                        }
                        className="w-9 shrink-0 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-card active:bg-kd-panel-muted dark:active:bg-kd-card-muted"
                      >
                        <Trash2 size={14} color={theme.red} strokeWidth={2.1} />
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
