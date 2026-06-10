import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { alpha } from '@/theme/tokens';

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
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
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
          <View style={styles.toolsBlock}>
            <SearchBox
              theme={theme}
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="ค้นหาชื่อ/รหัสสินค้า..."
            />

            <View style={styles.toolsRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: allSelected }}
                onPress={toggleAll}
                style={styles.selectAll}
              >
                <SelectCircle theme={theme} selected={allSelected} accent={theme.emerald} size={15} />
                <Text style={[styles.selectAllText, { color: theme.textSubtle }]}>
                  ทั้งหมด ({visibleProducts.length})
                </Text>
              </Pressable>

              <View style={styles.sortRow}>
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

        <View style={styles.list}>
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

  const backgroundColor = selected
    ? alpha(theme.emerald, theme.isDark ? 0.14 : 0.09)
    : theme.panel;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.productCard,
        {
          backgroundColor,
          borderColor: selected ? alpha(theme.emerald, 0.5) : theme.isDark ? theme.border : '#f3f4f6',
        },
      ]}
    >
      {!selected ? <CardBackdrop theme={theme} id="products" stops={libraryCardStops.products} /> : null}

      <View style={styles.productCardContent}>
        <View
          style={[
            styles.productThumb,
            {
              backgroundColor: theme.isDark ? theme.cardMuted : theme.panelMuted,
              borderColor: theme.isDark ? theme.borderStrong : theme.white,
            },
          ]}
        >
          <ImageIcon size={20} color={theme.textSubtle} strokeWidth={1.5} />
        </View>

        <View style={styles.productInfo}>
          <Text numberOfLines={1} style={[styles.productName, { color: theme.text }]}>
            {item.title}
          </Text>
          <Text numberOfLines={1} style={[styles.productCode, { color: theme.textSubtle }]}>
            #{getItemCode(item)} · สร้างจาก {sourceLabel}
          </Text>

          <View style={styles.productFooter}>
            <View style={styles.priceRow}>
              <Text style={[styles.priceText, { color: theme.emerald }]}>{stats.price}</Text>
              <Text style={[styles.priceDot, { color: theme.textSubtle }]}>·</Text>
              <Text style={[styles.stockText, { color: theme.textMuted }]}>{stats.stock}</Text>
            </View>

            <View style={styles.productActions}>
              <Pressable
                accessibilityLabel="แก้ไข"
                accessibilityRole="button"
                style={[
                  styles.cardIconButton,
                  { backgroundColor: theme.isDark ? alpha(theme.cardMuted, 0.6) : alpha(theme.white, 0.6) },
                ]}
              >
                <Pencil size={11} color={theme.textSubtle} strokeWidth={2} />
              </Pressable>
              <Pressable
                accessibilityLabel="ลบ"
                accessibilityRole="button"
                style={[
                  styles.cardIconButton,
                  { backgroundColor: theme.isDark ? alpha(theme.cardMuted, 0.6) : alpha(theme.white, 0.6) },
                ]}
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

const styles = StyleSheet.create({
  cardIconButton: {
    alignItems: 'center',
    borderRadius: 6,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  container: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 80,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  list: {
    gap: 8,
  },
  priceDot: {
    fontSize: 10,
  },
  priceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  priceText: {
    fontSize: 11,
    fontWeight: '500',
  },
  productActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
  },
  productCard: {
    borderRadius: 12,
    borderWidth: 1,
    elevation: 1,
    overflow: 'hidden',
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  productCardContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    padding: 8,
  },
  productCode: {
    fontSize: 10,
    marginTop: 2,
  },
  productFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
  },
  productName: {
    fontSize: 12,
    fontWeight: '600',
  },
  productThumb: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    flexShrink: 0,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  selectAll: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minHeight: 24,
  },
  selectAllText: {
    fontSize: 11,
  },
  sortRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  stockText: {
    fontSize: 10,
  },
  toolsBlock: {
    gap: 8,
  },
  toolsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
