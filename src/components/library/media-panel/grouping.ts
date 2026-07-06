import type { GeneratedMediaAsset } from '@/autopilot/generatedMediaStore';
import type { MediaGroupRecord, MediaKind, MediaSubItem } from './types';
import { formatAssetDate, formatAssetSize } from './utils';

export function toGeneratedGroups(kind: MediaKind, assets: GeneratedMediaAsset[]): { item: MediaGroupRecord; media: MediaSubItem[] }[] {
  const groupsByProduct = new Map<string, { item: MediaGroupRecord; media: MediaSubItem[] }>();
  for (const asset of assets) {
    const groupId = `generated-${kind}-${asset.productCode || asset.productId}`;
    const subtitle = asset.source === 'mobile-local-upload'
      ? 'เพิ่มจากเครื่อง'
      : asset.source === 'mobile-device-import'
        ? 'นำเข้าไฟล์จากเครื่อง'
        : asset.source === 'cloud-transfer'
          ? 'รับจาก Cloud Transfer'
          : 'Google Flow | Auto Pilot';
    const existing = groupsByProduct.get(groupId);
    const group =
      existing ??
      {
        item: {
          id: groupId,
          title: asset.productName,
          code: asset.productCode,
          subtitle,
        },
        media: [],
      };

    group.media.push({
      id: asset.id,
      parentId: groupId,
      title: asset.title,
      productName: asset.productName,
      productCode: asset.productCode,
      date: formatAssetDate(asset.createdAt),
      size: formatAssetSize(asset.sizeBytes),
      portrait: true,
      warnings: [],
      uri: asset.fileUri,
      mimeType: asset.mimeType,
      thumbnailUri: asset.thumbnailUri,
      productUrl: asset.productUrl,
      caption: asset.caption,
      hashtags: asset.hashtags,
      cta: asset.cta,
      platform: asset.platform,
    });

    groupsByProduct.set(groupId, group);
  }

  return Array.from(groupsByProduct.values()).map((group) => ({
    ...group,
    media: group.media.sort((first, second) => second.id.localeCompare(first.id)),
  }));
}
