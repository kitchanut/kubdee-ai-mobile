export type DeviceMode = 'desktop' | 'mobile';

export type TabId =
  | 'pipeline'
  | 'image-create'
  | 'shopee'
  | 'tiktok'
  | 'youtube'
  | 'facebook'
  | 'instagram'
  | 'library'
  | 'profile'
  | 'mobile'
  | 'logs';

/**
 * แพลตฟอร์มโซเชียลที่โพสต์วิดีโอผ่าน Buffer ได้ — id ตรงกับแท็บของแพลตฟอร์มนั้น
 * (ใช้ร่วมกันระหว่าง SocialPostScreen / LibraryScreen / MediaPanel)
 */
export type SocialService = 'facebook' | 'instagram' | 'youtube';

export interface DeviceRecord {
  id: string;
  name: string;
  serial: string;
  androidVersion: string;
  connection: 'local' | 'usb' | 'wifi';
  status: 'ready' | 'needs-permission' | 'running';
  profileName: string;
}

export interface ActivityLog {
  id: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
}
