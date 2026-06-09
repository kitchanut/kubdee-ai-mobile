export type DeviceMode = 'desktop' | 'mobile';

export type TabId =
  | 'pipeline'
  | 'tiktok'
  | 'shopee'
  | 'youtube'
  | 'facebook'
  | 'library'
  | 'profile'
  | 'mobile'
  | 'logs';

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
