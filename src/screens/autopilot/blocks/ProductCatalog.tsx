import { Image, Pressable, View } from 'react-native';
import { ChevronDown, FolderOpen, Image as ImageIcon, Link2, Plus, RefreshCw, Settings2, Trash2, X } from 'lucide-react-native';
import Text from '@/components/ui/KubdeeText';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';
import type { AffiliateProduct } from '@/library/types';
import type { AutoPilotProduct } from '@/autopilot/types';
import { type AutoPilotProductEditableField } from '../constants';

export function ProductCatalogBlock({
  isSyncing,
  profileProducts,
  selectedProducts,
  theme,
  onAddManualProduct,
  onClearProducts,
  onOpenSettings,
  onOpenPreset,
  onOpenProductSelect,
  onRemoveProduct,
  onSyncProducts,
  onUpdateProductField,
}: {
  isSyncing: boolean;
  profileProducts: AffiliateProduct[];
  selectedProducts: AutoPilotProduct[];
  theme: KubdeeTheme;
  onAddManualProduct: () => void;
  onClearProducts: () => void;
  onOpenSettings: (productId: string) => void;
  onOpenPreset: () => void;
  onOpenProductSelect: () => void;
  onRemoveProduct: (productId: string) => void;
  onSyncProducts: () => void;
  onUpdateProductField: (productId: string, field: AutoPilotProductEditableField, value: string) => void;
}): React.JSX.Element {
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-1.5">
        <ImageIcon size={16} color={theme.textMuted} strokeWidth={2} />
        <Text numberOfLines={1} className="text-[13px] font-semibold text-kd-text">
          ข้อมูลสินค้า ({selectedProducts.length})
        </Text>
        <View className="flex-1" />
        <Button
          accessibilityLabel="เปิด Product Preset"
          accessibilityRole="button"
          variant="ghost"
          onPress={onOpenPreset}
          className="h-8 flex-row items-center justify-center gap-1 rounded-kd-md px-2"
        >
          <Text className="text-kd-caption font-medium text-kd-text-subtle">Preset</Text>
          <ChevronDown size={12} color={theme.textSubtle} strokeWidth={2.2} />
        </Button>
        <View className="h-5 w-px bg-kd-border" />
        <Button
          accessibilityLabel="เลือกสินค้าจากคลัง"
          accessibilityRole="button"
          variant="ghost"
          onPress={onOpenProductSelect}
          className="h-8 w-8 items-center justify-center rounded-kd-md"
        >
          <FolderOpen size={16} color={theme.textSubtle} strokeWidth={2.1} />
        </Button>
        <Button
          accessibilityLabel="เพิ่มสินค้าเอง"
          accessibilityRole="button"
          variant="ghost"
          onPress={onAddManualProduct}
          className="h-8 w-8 items-center justify-center rounded-kd-md"
        >
          <Plus size={17} color={theme.textSubtle} strokeWidth={2.1} />
        </Button>
        {selectedProducts.length > 0 ? (
          <Button
            accessibilityLabel="ล้างสินค้าที่เลือก"
            accessibilityRole="button"
            variant="ghost"
            onPress={onClearProducts}
            className="h-8 w-8 items-center justify-center rounded-kd-md"
          >
            <Trash2 size={16} color={theme.textSubtle} strokeWidth={2.1} />
          </Button>
        ) : null}
      </View>

      {selectedProducts.length > 0 ? (
        <View className="gap-2">
          {selectedProducts.map((product, index) => (
            <ProductRow
              index={index}
              key={product.id}
              product={product}
              theme={theme}
              onOpenSettings={() => onOpenSettings(product.id)}
              onRemove={() => onRemoveProduct(product.id)}
              onUpdate={(field, value) => onUpdateProductField(product.id, field, value)}
            />
          ))}
        </View>
      ) : (
        <View className="min-h-[210px] items-center justify-center gap-3">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-kd-panel-muted dark:bg-kd-card-muted">
            <ImageIcon size={25} color={theme.textSubtle} strokeWidth={1.8} />
          </View>
          <Text className="text-kd-caption font-medium text-kd-text-subtle">
            {profileProducts.length === 0 ? 'ยังไม่มีสินค้าในโปรไฟล์นี้' : 'เพิ่มสินค้าจากคลังหรือเพิ่มเอง'}
          </Text>
          {profileProducts.length === 0 ? (
            <Button
              accessibilityLabel="ซิงก์คลังสินค้า"
              accessibilityRole="button"
              disabled={isSyncing}
              variant="ghost"
              onPress={onSyncProducts}
              className="h-8 flex-row items-center justify-center gap-1 rounded-kd-md border border-kd-border bg-kd-input px-2"
            >
              <RefreshCw size={13} color={theme.textSubtle} strokeWidth={2.1} />
              <Text className="text-kd-caption font-medium text-kd-text-subtle">{isSyncing ? 'กำลังซิงก์...' : 'ซิงก์คลังสินค้า'}</Text>
            </Button>
          ) : null}
        </View>
      )}
    </View>
  );
}

function ProductRow({
  index,
  product,
  theme,
  onOpenSettings,
  onRemove,
  onUpdate,
}: {
  index: number;
  product: AutoPilotProduct;
  theme: KubdeeTheme;
  onOpenSettings: () => void;
  onRemove: () => void;
  onUpdate: (field: AutoPilotProductEditableField, value: string) => void;
}): React.JSX.Element {
  const isManualProduct = product.platform === 'manual' || product.id.startsWith('manual-');

  return (
    <View className="flex-row gap-2 rounded-kd-lg border border-kd-border bg-kd-card p-2">
      <Pressable
        accessibilityLabel="ตั้งค่ารายสินค้า"
        accessibilityRole="button"
        onPress={onOpenSettings}
        className="relative overflow-hidden rounded-kd-lg bg-kd-panel-muted dark:bg-kd-card-muted"
        style={{ height: 126, width: 86 }}
      >
        <View className="absolute left-0 top-0 z-10 h-7 min-w-7 items-center justify-center rounded-br-kd-md bg-black/55 px-1">
          <Text className="text-[11px] font-bold text-white">{index + 1}</Text>
        </View>
        {product.preview ? (
          <Image source={{ uri: product.preview }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <ImageIcon size={22} color={theme.textSubtle} strokeWidth={1.8} />
          </View>
        )}
      </Pressable>

      <View className="min-w-0 flex-1 gap-0.5">
        <View className="min-w-0 flex-row items-center gap-1">
          <Text className="text-[10px] font-medium text-kd-text-subtle">#</Text>
          {isManualProduct ? (
            <Input
              value={product.productId}
              onChangeText={(value) => onUpdate('productId', value)}
              placeholder="รหัสสินค้า"
              placeholderTextColor={theme.textSubtle}
              className="h-6 min-h-6 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-[10px] text-kd-text-subtle shadow-none"
              style={{ fontFamily: kubdeeFontFamilies.thai.regular, fontSize: 10, lineHeight: 13, paddingVertical: 0 }}
            />
          ) : (
            <Text
              numberOfLines={1}
              className="min-w-0 flex-1 text-kd-text-subtle"
              style={{ fontSize: 10, lineHeight: 13 }}
            >
              {product.productId || product.catalogId}
            </Text>
          )}
          <Button
            accessibilityLabel="ตั้งค่ารายสินค้า"
            accessibilityRole="button"
            variant="ghost"
            size="icon"
            onPress={onOpenSettings}
            className="h-6 w-6 shrink-0 items-center justify-center rounded-kd-sm"
          >
            <Settings2 size={13} color={theme.textSubtle} strokeWidth={2.2} />
          </Button>
          <Button
            accessibilityLabel="เอาสินค้าออกจาก Auto Pipeline"
            accessibilityRole="button"
            variant="ghost"
            size="icon"
            onPress={onRemove}
            className="h-6 w-6 shrink-0 items-center justify-center rounded-kd-sm"
          >
            <X size={13} color={theme.textSubtle} strokeWidth={2.2} />
          </Button>
        </View>

        <View className="min-w-0 flex-row items-center gap-1">
          <Link2 size={10} color={theme.textSubtle} strokeWidth={2} />
          {isManualProduct ? (
            <Input
              value={product.productUrl}
              onChangeText={(value) => onUpdate('productUrl', value)}
              placeholder="ลิงก์สินค้า"
              placeholderTextColor={theme.textSubtle}
              className="h-6 min-h-6 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-[10px] text-kd-text-subtle shadow-none"
              style={{ fontFamily: kubdeeFontFamilies.thai.regular, fontSize: 10, lineHeight: 13, paddingVertical: 0 }}
            />
          ) : (
            <Text
              numberOfLines={1}
              className="min-w-0 flex-1 text-kd-text-subtle"
              style={{ color: product.productUrl ? theme.textSubtle : alpha(theme.textSubtle, 0.55), fontSize: 10, lineHeight: 14 }}
            >
              {product.productUrl || 'ลิงก์สินค้า'}
            </Text>
          )}
        </View>

        {isManualProduct ? (
          <Textarea
            value={product.name}
            onChangeText={(value) => onUpdate('name', value)}
            placeholder="ชื่อสินค้า"
            placeholderTextColor={theme.textSubtle}
            numberOfLines={2}
            className="h-[42px] min-h-[42px] rounded-none border-0 bg-transparent px-0 py-0 text-kd-text shadow-none"
            style={{ fontFamily: kubdeeFontFamilies.thai.medium, fontSize: 11, lineHeight: 14, paddingVertical: 0 }}
          />
        ) : (
          <Text
            numberOfLines={2}
            className="min-h-[32px] text-kd-text"
            style={{ fontFamily: kubdeeFontFamilies.thai.medium, fontSize: 11, lineHeight: 14 }}
          >
            {product.name || 'ชื่อสินค้า'}
          </Text>
        )}

        {isManualProduct ? (
          <Input
            value={product.hashtags}
            onChangeText={(value) => onUpdate('hashtags', value)}
            placeholder="#แฮชแท็ก"
            placeholderTextColor={theme.textSubtle}
            className="h-6 min-h-6 rounded-none border-0 bg-transparent px-0 py-0 text-[10px] text-kd-text-subtle shadow-none"
            style={{ fontFamily: kubdeeFontFamilies.thai.regular, fontSize: 10, lineHeight: 13, paddingVertical: 0 }}
          />
        ) : (
          <Text
            numberOfLines={1}
            className="text-kd-text-subtle"
            style={{ color: product.hashtags ? theme.textSubtle : alpha(theme.textSubtle, 0.55), fontSize: 10, lineHeight: 14 }}
          >
            {product.hashtags || '#แฮชแท็ก'}
          </Text>
        )}

        {isManualProduct ? (
          <Input
            value={product.cta}
            onChangeText={(value) => onUpdate('cta', value)}
            placeholder="CTA (Call to Action)"
            placeholderTextColor={theme.textSubtle}
            className="h-6 min-h-6 rounded-none border-0 bg-transparent px-0 py-0 text-[10px] text-kd-text-subtle shadow-none"
            style={{ fontFamily: kubdeeFontFamilies.thai.regular, fontSize: 10, lineHeight: 13, paddingVertical: 0 }}
          />
        ) : (
          <Text
            numberOfLines={1}
            className="text-kd-text-subtle"
            style={{ color: product.cta ? theme.textSubtle : alpha(theme.textSubtle, 0.55), fontSize: 10, lineHeight: 14 }}
          >
            {product.cta || 'CTA (Call to Action)'}
          </Text>
        )}
      </View>
    </View>
  );
}
