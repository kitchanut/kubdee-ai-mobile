# Development — kubdee-ai-mobile

คู่มือ onboarding นักพัฒนาใหม่ (Expo SDK 56 · React Native · Android accessibility automation)

## Prerequisites (เครื่องนี้ไม่มี Android Studio)

ต้อง export ก่อนทุกคำสั่งที่แตะ Android build:

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
```

- Android SDK มาจาก brew cask `android-commandlinetools`
- JDK จาก brew `openjdk@17` (keg-only)
- `adb` อยู่ที่ `/opt/homebrew/bin/adb`

## Dev loop

แอปนี้เป็น **dev build** (มี native accessibility module) ไม่ใช่ Expo Go — ต้อง build ลงเครื่องจริง:

```bash
npm install
npm run android          # build + ติดตั้ง dev client ลงมือถือที่ต่ออยู่ (ครั้งแรก)
npm start                # รัน Metro (ครั้งต่อไปเปิดแอป dev client แล้ว reload JS)
```

ทดสอบบนมือถือจริงผ่าน Wi-Fi ADB + Expo dev client (ดูเครื่องที่ต่อ: `adb devices`)

## โครงสร้าง `src/`

| โฟลเดอร์ | หน้าที่ |
|----------|---------|
| `screens/`, `components/` | UI (NativeWind + `KubdeeText`) |
| `autopilot/`, `flow-core/` | ขับ Google Flow ใน WebView (inject JS) สร้างรูป/วิดีโอ |
| `library/` | คลังสินค้า/มีเดีย (SQLite offline-first + cloud sync) |
| `native/AccessibilityBridge.ts` | สะพานไป Kotlin automation (Shopee import/post) |
| `auth/`, `services/`, `hooks/` | auth, cloud transfer, incremental saver |
| `plugins/templates/*.kt` | **โค้ด Kotlin จริง** (canonical) — ดูกติกาด้านล่าง |

## กติกาสำคัญ (ห้ามพลาด)

1. **Native Kotlin = source เดียว** — แก้ที่ `plugins/templates/*.kt` เท่านั้น แล้ว `npx expo prebuild -p android`
   ห้ามแก้ `android/.../automation/*.kt` ตรงๆ (`npm run check:native-drift` กันไว้)
2. **Version = source เดียว** — `package.json` เป็นเจ้าของ version string; bump ด้วย `npm version`
   (`npm run check:release` กันไว้)
3. **`element.click()` ใน content actions** — ห้ามใช้ `dispatchEvent` (ดู CLAUDE.md ราก)
4. **UI ห้ามใช้ emoji** — ใช้ SVG icon (Heroicons/lucide) เท่านั้น
5. **Release ต้องเซ็น rotation** — ผ่าน `scripts/sign-release.mjs` เท่านั้น (ดู MOBILE_RELEASE.md)

## Verify ก่อน commit

```bash
npm run verify           # typecheck + native-drift + release-consistency
```

CI (`.github/workflows/ci.yml`) รัน 3 อย่างนี้ทุก push/PR เข้า master

## เอกสารที่เกี่ยวข้อง

- `docs/MOBILE_RELEASE.md` — runbook ปล่อยเวอร์ชัน + signing
- `docs/SHOPEE_POST_FLOW.md` — flow โพสต์วิดีโอ Shopee
- `docs/CODE_REVIEW_2026-07-07.md` — รีวิวโค้ด + roadmap ปรับปรุง
- `AGENTS.md` — กติกาสั้นสำหรับ AI agent
