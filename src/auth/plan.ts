import { REQUIRED_PLAN } from '@/auth/constants';
import type { AuthUser } from '@/auth/types';

export function normalizeExpiryDate(expiryDate: AuthUser['expiryDate']): Date | null {
  if (!expiryDate) {
    return null;
  }

  if (typeof expiryDate === 'number') {
    return new Date(expiryDate > 1e12 ? expiryDate : expiryDate * 1000);
  }

  const timestamp = Date.parse(expiryDate);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

export function getRequiredPlanError(user: AuthUser | null): string | null {
  if (!user) {
    return 'Not authenticated';
  }

  if (user.plan !== REQUIRED_PLAN) {
    return 'Ultra plan required';
  }

  const expiryDate = normalizeExpiryDate(user.expiryDate);
  if (expiryDate && expiryDate.getTime() < Date.now()) {
    return 'Plan expired';
  }

  return null;
}

export function formatPlanLabel(plan?: string | null): string {
  if (!plan) {
    return 'Free';
  }

  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function formatExpiryLabel(expiryDate: AuthUser['expiryDate']): string {
  const date = normalizeExpiryDate(expiryDate);
  if (!date) {
    return 'ไม่มีกำหนดหมดอายุ';
  }

  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function toThaiPlanError(error: string | null): string {
  if (error === 'Plan expired') {
    return 'แพลนของคุณหมดอายุแล้ว กรุณาต่ออายุเพื่อใช้งานต่อ';
  }

  if (error === 'Online verification required. Please check your internet connection.') {
    return 'ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อตรวจสอบสิทธิ์';
  }

  if (error === 'Session expired') {
    return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
  }

  if (error === 'Unauthorized' || error === 'User not found') {
    return 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองเข้าสู่ระบบใหม่';
  }

  if (error === 'Cannot open login browser') {
    return 'เปิดหน้าเข้าสู่ระบบไม่ได้ กรุณาตรวจสอบเบราว์เซอร์ในเครื่อง';
  }

  return 'แอปนี้ต้องใช้แพลน Ultra เหมือน Desktop';
}
