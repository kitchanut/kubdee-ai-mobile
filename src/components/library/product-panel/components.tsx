import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Image as ImageIcon, Pencil, Trash2 } from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import { isDisplayableProductImageUri } from '@/library/productImageCache';
import type { AffiliateProduct } from '@/library/types';
import { SHOPEE_ORANGE, SHOPEE_ORANGE_SOFT } from '@/theme/brandColors';
import type { KubdeeTheme } from '@/theme/tokens';
import { CardBackdrop, libraryCardStops } from '../shared';
import {
  formatPrice,
  formatStock,
  getCreatedByLabel,
  getItemCode,
  getPlatformLabel,
  getUpdatedByLabel,
  shortenItemCode,
} from './utils';

export function ShopeeImportOptionButton({
  active,
  disabled = false,
  label,
  compact = false,
  soon = false,
  onPress,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  compact?: boolean;
  soon?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-10 flex-row items-center justify-center gap-1.5 rounded-kd-lg border px-3 ${
        compact ? 'min-w-[78px] flex-grow' : 'flex-1'
      } ${active ? '' : 'border-kd-border bg-kd-card'} ${disabled ? 'opacity-45' : ''}`}
      style={
        active
          ? {
              backgroundColor: SHOPEE_ORANGE_SOFT,
              borderColor: SHOPEE_ORANGE,
            }
          : undefined
      }
    >
      <Text
        numberOfLines={1}
        className={`text-kd-body font-semibold ${active ? '' : 'text-kd-text-subtle'}`}
        style={active ? { color: SHOPEE_ORANGE } : undefined}
      >
        {label}
      </Text>
      {soon ? (
        <View className="rounded-full bg-kd-card-muted px-1.5 py-px">
          <Text className="text-[8px] font-bold text-kd-text-muted">SOON</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Extension ProductCatalogPanel card:
 * rounded-xl border / emerald wash background / 56px thumb / name 11px semibold /
 * #id 9px / platform chip + profile meta / price emerald + stock / edit + delete buttons
 */
export function ProductCard({
  product,
  selected,
  theme,
  onPress,
  onDelete,
}: {
  product: AffiliateProduct;
  selected: boolean;
  theme: KubdeeTheme;
  onPress: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const platformLabel = getPlatformLabel(product.platform);
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
      accessibilityRole="button"
      onPress={onPress}
      className={`overflow-hidden rounded-[12px] border bg-kd-panel ${
        selected ? 'border-kd-emerald' : 'border-gray-100 dark:border-kd-border'
      }`}
      style={{
        elevation: 1,
        shadowOffset: { height: 1, width: 0 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      }}
    >
      <CardBackdrop theme={theme} id="products" stops={libraryCardStops.products} />

      <View className="flex-row items-center gap-2.5 p-2">
        <View className="h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border-2 border-white bg-kd-panel-muted dark:border-kd-border-strong dark:bg-kd-card-muted">
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              resizeMode="cover"
              accessibilityLabel={product.name}
              className="h-full w-full"
              onError={() => {
                setFailedImageUris((current) => current.includes(imageUri) ? current : [...current, imageUri]);
              }}
            />
          ) : (
            <ImageIcon size={20} color={theme.textSubtle} strokeWidth={1.5} />
          )}
        </View>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="min-w-0 flex-shrink text-kd-body font-semibold text-kd-text">
              {product.name}
            </Text>
            {platformLabel ? (
              <View className="shrink-0 rounded-full bg-kd-panel-muted px-1.5 py-px dark:bg-kd-card-muted">
                <Text className="text-[8px] font-medium text-kd-text-muted">{platformLabel}</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} className="mt-0.5 text-kd-micro text-kd-text-subtle">
            #{shortenItemCode(getItemCode(product))}
            {getCreatedByLabel(product) ? ` · Created by ${getCreatedByLabel(product)}` : ''}
            {getUpdatedByLabel(product) ? ` · Updated by ${getUpdatedByLabel(product)}` : ''}
          </Text>

          <View className="mt-1 flex-row items-center justify-between">
            <View className="flex-row items-center gap-1">
              <Text className="text-kd-caption font-medium text-kd-emerald">{formatPrice(product.price)}</Text>
              <Text className="text-kd-micro text-kd-text-subtle">·</Text>
              <Text className="text-kd-micro text-kd-text-muted">{formatStock(product.stock)}</Text>
            </View>

            <View className="shrink-0 flex-row items-center gap-1">
              <Pressable
                accessibilityLabel="แก้ไข"
                accessibilityRole="button"
                className="h-[22px] w-[22px] items-center justify-center rounded-kd-md bg-white/60 dark:bg-kd-card-muted/60"
              >
                <Pencil size={11} color={theme.textSubtle} strokeWidth={2} />
              </Pressable>
              <Pressable
                accessibilityLabel="ลบ"
                accessibilityRole="button"
                onPress={onDelete}
                className="h-[22px] w-[22px] items-center justify-center rounded-kd-md bg-white/60 dark:bg-kd-card-muted/60"
              >
                <Trash2 size={11} color={theme.textSubtle} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
