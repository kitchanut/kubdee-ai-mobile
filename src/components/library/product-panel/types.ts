export type SortKey = 'name' | 'code' | 'date';
export type ShopeeImportSource = 'liked' | 'offers';
export type ShopeeLikedViewMode = 'buyer' | 'partner';
export type ShopeeImportAmount = 1 | 5 | 10 | 20 | 50 | 100 | 'all' | 'custom';
export type ShopeeOfferCategory =
  | 'แนะนำ'
  | 'เครื่องใช้ในบ้าน'
  | 'กีฬาและกิจกรรมกลางแจ้ง'
  | 'เสื้อผ้าแฟชั่นผู้ชาย'
  | 'เครื่องใช้ไฟฟ้าภายในบ้าน'
  | 'กลุ่มผลิตภัณฑ์เพื่อสุขภาพ';
