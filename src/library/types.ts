/**
 * Affiliate product pushed from the Desktop app and pulled via
 * GET /api/user/affiliate-products (see kubdee-ai-web backend).
 */
export interface AffiliateProduct {
  id: number | string;
  userId: string;
  localId: string;
  profileLocalId: string | null;
  name: string;
  description: string | null;
  externalProductId: string | null;
  productUrl: string | null;
  /** Decimal string, e.g. "229.00" */
  price: string | null;
  stock: number | null;
  caption: string | null;
  hashtags: string | null;
  cta: string | null;
  imagePath: string | null;
  imageR2Key: string | null;
  /** Public R2 URL of the product image */
  imageUrl: string | null;
  imageHash: string | null;
  imageMimeType: string | null;
  imageSize: number | null;
  imageUploadedAt: number | string | null;
  /** e.g. 'tiktok' | 'shopee' */
  platform: string | null;
  status: string | null;
  scrapedAt: number | string | null;
  /** Unix milliseconds */
  localCreatedAt: number | null;
  originApp: string | null;
  createdByApp: string | null;
  updatedByApp: string | null;
  /** Unix seconds */
  lastSyncedAt: number | null;
  createdAt: number | string | null;
  updatedAt: number | string | null;
  /** Joined server-side from the synced profile */
  profileName: string | null;
  groupLocalId: string | null;
}
