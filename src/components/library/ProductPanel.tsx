import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  CloudDownload,
  Image as ImageIcon,
  Pencil,
  RefreshCw,
  ShoppingBag,
  Trash2,
  Upload,
} from 'lucide-react-native';

import { TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { galleryItems, type GalleryItemRecord } from '@/data/mockData';
import type { KubdeeTheme } from '@/theme/tokens';

import {
  CardBackdrop,
  DarkActionButton,
  EmptyState,
  HeaderIconButton,
  LibraryPanelHeader,
  SearchBox,
  SelectCircle,
  SelectionBar,
  SortPill,
  darkButtonContentColor,
  getAccentTone,
  libraryCardStops,
} from './shared';

const mockProductStats: Record<string, { price: string; stock: string }> = {
  'prod-luggage': { price: '฿229.00', stock: '3,336 ชิ้น' },
  'prod-skincare': { price: '฿295.00', stock: '9,607 ชิ้น' },
};

const mockItemCodes: Record<string, string> = {
  'prod-luggage': 'SHP-1202',
  'prod-skincare': 'SHP-2088',
};

type SortKey = 'name' | 'code' | 'date';

function getItemCode(item: GalleryItemRecord): string {
  return mockItemCodes[item.id] ?? item.subtitle.split('|')[0]?.trim().replace(/^#/, '') ?? item.id;
}

export default function ProductPanel({ theme }: { theme: KubdeeTheme }): React.JSX.Element {
  const accent = getAccentTone(theme, theme.emerald);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAscending, setSortAscending] = useState(true);

  const products = useMemo(() => galleryItems.filter((item) => item.category === 'products'), []);

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = products.filter((item) => {
      if (!query) return true;
      return [item.title, getItemCode(item)].join(' ').toLowerCase().includes(query);
    });
    const direction = sortAscending ? 1 : -1;
    filtered.sort((first, second) => {
      if (sortKey === 'name') return direction * first.title.localeCompare(second.title, 'th');
      if (sortKey === 'code') return direction * getItemCode(first).localeCompare(getItemCode(second), 'th');
      return direction * first.id.localeCompare(second.id, 'th');
    });
    return filtered;
  }, [products, searchQuery, sortAscending, sortKey]);

  const allSelected =
    visibleProducts.length > 0 && visibleProducts.every((item) => selectedIds.has(item.id));

  const toggleSelect = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (): void => {
    setSelectedIds(() => {
      if (allSelected) return new Set();
      return new Set(visibleProducts.map((item) => item.id));
    });
  };

  const changeSort = (next: SortKey): void => {
    if (sortKey === next) {
      setSortAscending((current) => !current);
      return;
    }
    setSortKey(next);
    setSortAscending(next !== 'date');
  };

  return (
    <View className="flex-1">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 px-3 pb-20 pt-3">
        <LibraryPanelHeader
          theme={theme}
          title="คลังสินค้า"
          count={visibleProducts.length}
          total={products.length}
          icon={ShoppingBag}
          tone={accent}
          actions={
            <>
              <HeaderIconButton theme={theme} icon={RefreshCw} label="รีเฟรช" />
              <HeaderIconButton theme={theme} icon={CloudDownload} label="ซิงก์คลังสินค้า" />
              <HeaderIconButton theme={theme} icon={Upload} label="อัพโหลดสินค้า" />
              <DarkActionButton
                theme={theme}
                small
                label="ShowCase"
                leading={<TikTokLogo size={10} color={darkButtonContentColor(theme)} />}
              />
            </>
          }
        />

        {products.length > 0 ? (
          <View className="gap-2">
            <SearchBox
              theme={theme}
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="ค้นหาชื่อ/รหัสสินค้า..."
            />

            <View className="flex-row items-center justify-between">
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: allSelected }}
                onPress={toggleAll}
                className="min-h-6 flex-row items-center gap-1.5"
              >
                <SelectCircle theme={theme} selected={allSelected} accent={theme.emerald} size={15} />
                <Text className="text-kd-caption text-kd-text-subtle">
                  ทั้งหมด ({visibleProducts.length})
                </Text>
              </Pressable>

              <View className="flex-row items-center gap-1">
                <SortPill
                  theme={theme}
                  accent={theme.emerald}
                  active={sortKey === 'name'}
                  ascending={sortAscending}
                  label="ชื่อ"
                  onPress={() => changeSort('name')}
                />
                <SortPill
                  theme={theme}
                  accent={theme.emerald}
                  active={sortKey === 'code'}
                  ascending={sortAscending}
                  label="รหัส"
                  onPress={() => changeSort('code')}
                />
                <SortPill
                  theme={theme}
                  accent={theme.emerald}
                  active={sortKey === 'date'}
                  ascending={sortAscending}
                  label="วันที่"
                  onPress={() => changeSort('date')}
                />
              </View>
            </View>
          </View>
        ) : null}

        <View className="gap-2">
          {visibleProducts.map((item) => (
            <ProductCard
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              theme={theme}
              onPress={() => toggleSelect(item.id)}
            />
          ))}
        </View>

        {visibleProducts.length === 0 ? (
          <EmptyState
            theme={theme}
            icon={ShoppingBag}
            title="ยังไม่มีสินค้า"
            copy="เพิ่มสินค้าเพื่อสร้างรูปโฆษณาและวิดีโอแบบอัตโนมัติ"
          />
        ) : null}
      </ScrollView>

      {selectedIds.size > 0 ? (
        <SelectionBar
          theme={theme}
          accent={theme.emerald}
          count={selectedIds.size}
          showAuto
          onClear={() => setSelectedIds(new Set())}
        />
      ) : null}
    </View>
  );
}

/**
 * Extension ProductCatalogPanel card:
 * rounded-xl border / emerald wash background / 56px thumb / name 11px semibold /
 * #id 9px / source chip / price emerald + stock / edit + delete buttons
 */
function ProductCard({
  item,
  selected,
  theme,
  onPress,
}: {
  item: GalleryItemRecord;
  selected: boolean;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  const stats = mockProductStats[item.id] ?? { price: '฿189.00', stock: '67 ชิ้น' };
  const sourceLabel = item.badges.includes('Shopee') ? 'Shopee' : 'Extension';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`overflow-hidden rounded-[12px] border ${
        selected
          ? 'border-kd-emerald/50 bg-kd-emerald/10 dark:bg-kd-emerald/15'
          : 'border-gray-100 bg-kd-panel dark:border-kd-border'
      }`}
      style={{
        elevation: 1,
        shadowOffset: { height: 1, width: 0 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      }}
    >
      {!selected ? <CardBackdrop theme={theme} id="products" stops={libraryCardStops.products} /> : null}

      <View className="flex-row items-center gap-2.5 p-2">
        <View className="h-14 w-14 shrink-0 items-center justify-center rounded-[12px] border-2 border-white bg-kd-panel-muted dark:border-kd-border-strong dark:bg-kd-card-muted">
          <ImageIcon size={20} color={theme.textSubtle} strokeWidth={1.5} />
        </View>

        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
            {item.title}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 text-kd-micro text-kd-text-subtle">
            #{getItemCode(item)} · สร้างจาก {sourceLabel}
          </Text>

          <View className="mt-1 flex-row items-center justify-between">
            <View className="flex-row items-center gap-1">
              <Text className="text-kd-caption font-medium text-kd-emerald">{stats.price}</Text>
              <Text className="text-kd-micro text-kd-text-subtle">·</Text>
              <Text className="text-kd-micro text-kd-text-muted">{stats.stock}</Text>
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
