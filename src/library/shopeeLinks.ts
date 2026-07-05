// ลิงก์ Shopee มี 2 แบบ: short affiliate link (s.shopee.co.th/xxx) และลิงก์เต็ม
// (shopee.co.th/{shop}/{shopId}/{itemId}) — ช่องค้นหาสินค้าตอนโพส Shopee
// หาเจอเฉพาะ short link เท่านั้น ลิงก์เต็มใช้ค้นหาไม่ได้ (ได้แค่ไว้แกะรหัสจริง)

export function isShopeeShortLink(value: string | null | undefined): boolean {
  const raw = value?.trim();
  if (!raw) {
    return false;
  }

  try {
    const url = new URL(raw);
    return /^s\.shopee\./i.test(url.hostname);
  } catch {
    return false;
  }
}

// เลือกลิงก์ที่เหมาะเก็บเป็น productUrl: short link ชนะเสมอ (ใช้โพสได้จริง)
export function pickPreferredShopeeUrl(
  incoming: string | null | undefined,
  existing: string | null | undefined
): string | null {
  const cleanIncoming = incoming?.trim() || null;
  const cleanExisting = existing?.trim() || null;

  if (isShopeeShortLink(cleanIncoming)) {
    return cleanIncoming;
  }
  if (isShopeeShortLink(cleanExisting)) {
    return cleanExisting;
  }
  return cleanIncoming ?? cleanExisting;
}
