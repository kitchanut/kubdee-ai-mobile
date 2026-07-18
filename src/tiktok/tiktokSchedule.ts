import type { TikTokPostSettings } from '@/tiktok/tiktokPostSettingsStore';

// Port สูตรคำนวณเวลาตั้งโพสต์จาก desktop setSchedule.ts — คำนวณฝั่งแอป (ไม่ใช่ใน WebView)
// แล้วส่งผลลัพธ์เป็น INPUT.schedule เข้า script; base ของคลิปถัดไป = เวลาที่ปัดแล้วของคลิปก่อนหน้า

export interface TikTokScheduleTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dateStr: string;
  timeStr: string;
}

export function parseIntervalToMinutes(value: string): number {
  const match = /^(\d+)([mhd])$/.exec(value || '');
  if (!match) return 20;
  const amount = parseInt(match[1], 10);
  if (match[2] === 'h') return amount * 60;
  if (match[2] === 'd') return amount * 1440;
  return amount;
}

function toScheduleTime(date: Date): TikTokScheduleTime {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  return {
    year,
    month,
    day,
    hour,
    minute,
    dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

export function computeNextScheduleTime({
  settings,
  postIndex,
  base,
}: {
  settings: TikTokPostSettings;
  postIndex: number;
  base: TikTokScheduleTime | null;
}): TikTokScheduleTime {
  let targetDate: Date;

  if (postIndex === 0 && !base) {
    if (settings.firstPostTimeMode === 'custom') {
      const hour = parseInt(settings.firstPostCustomHour, 10) || 0;
      const minute = parseInt(settings.firstPostCustomMinute, 10) || 0;
      // desktop ต้องมีทั้ง date+time; mobile ยอมเว้นวันที่ว่าง = วันนี้
      targetDate = settings.firstPostCustomDate
        ? new Date(settings.firstPostCustomDate)
        : new Date();
      if (Number.isNaN(targetDate.getTime())) targetDate = new Date();
      targetDate.setHours(hour, minute, 0, 0);
    } else {
      targetDate = new Date();
      targetDate.setMinutes(
        targetDate.getMinutes() + parseIntervalToMinutes(settings.firstPostOffset || '20m')
      );
    }
  } else if (base) {
    targetDate = new Date(base.year, base.month - 1, base.day, base.hour, base.minute);
    targetDate.setMinutes(
      targetDate.getMinutes() + parseIntervalToMinutes(settings.interval || '15m')
    );
  } else {
    targetDate = new Date();
    targetDate.setMinutes(
      targetDate.getMinutes() +
        parseIntervalToMinutes(settings.firstPostOffset || '20m') +
        parseIntervalToMinutes(settings.interval || '15m') * postIndex
    );
  }

  const variation = settings.intervalVariation || 0;
  if (variation > 0) {
    const randomOffset = Math.floor(Math.random() * (variation * 2 + 1)) - variation;
    targetDate.setMinutes(targetDate.getMinutes() + randomOffset);
  }

  // ปัดขึ้นเป็นช่อง 5 นาที (TikTok picker มีเฉพาะ step 5 นาที)
  const roundedMinute = Math.ceil(targetDate.getMinutes() / 5) * 5;
  if (roundedMinute >= 60) {
    targetDate.setHours(targetDate.getHours() + 1);
    targetDate.setMinutes(0);
  } else {
    targetDate.setMinutes(roundedMinute);
  }

  return toScheduleTime(targetDate);
}
