import { Toaster } from 'sonner-native';

// Toaster สำหรับฝังใน RN Modal — Toaster หลัก (App.tsx) อยู่ root window
// ซึ่งบน Android จะโดน Modal บัง toast ที่ยิงตอน Modal เปิดอยู่จึงมองไม่เห็น
// store ของ sonner-native เป็น pub/sub → mount หลายตัวได้ ตัวใน window บนสุดคือตัวที่ผู้ใช้เห็น
export function KubdeeToaster({ isDark }: { isDark: boolean }): React.JSX.Element {
  return (
    <Toaster
      theme={isDark ? 'dark' : 'light'}
      richColors
      toastOptions={{
        titleStyle: { fontFamily: 'NotoSansThai_500Medium' },
        descriptionStyle: { fontFamily: 'NotoSansThai_400Regular' },
      }}
    />
  );
}
