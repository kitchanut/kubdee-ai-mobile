# Kubdee AI Mobile Release Checklist

เอกสารนี้เป็น runbook ภายในสำหรับปล่อยเวอร์ชัน Mobile App เท่านั้น release notes ที่ผู้ใช้เห็นควรมีเฉพาะสิ่งที่กระทบการใช้งานจริง ไม่ใส่รายละเอียดด้านความปลอดภัยหรือข้อมูลภายใน

## Contract

- GitHub repo: `kitchanut/kubdee-ai-mobile`
- Tag format: `vX.Y.Z`
- APK asset name: `kubdee-ai-mobile-vX.Y.Z.apk`
- Web download API: `GET https://kubdee.ai/api/user/releases?app=mobile`
- แอปใช้ `version` และ `versionCode` เพื่อตัดสินว่ามีอัปเดตใหม่

## Files To Update

อัปเดตทุกครั้งก่อน build:

- `package.json`
- `package-lock.json`
- `app.config.ts`
- `app.json`
- `src/updates/mobileChangelog.ts`

ถ้า build จาก native Android folder ในเครื่องนี้ ให้ปรับ version ในไฟล์ local ด้วย:

- `android/app/build.gradle`

หมายเหตุ: `android/` ถูก ignore ใน git ดังนั้นค่าที่ commit หลักควรอยู่ใน Expo config เสมอ

## Release Steps

1. Bump version และเพิ่ม `versionCode`

   ```bash
   # ตัวอย่าง: ตรวจค่า version/versionCode เดิมก่อนแก้
   rg -n "0.1.2|versionCode 3|versionCode: 3" package.json package-lock.json app.config.ts app.json android/app/build.gradle src/updates/mobileChangelog.ts
   ```

   > ⚠️ **ต้องแก้ `android/app/build.gradle` ด้วยมือทุกครั้ง** (`versionCode` + `versionName`) —
   > ไฟล์นี้ถูก gitignore และ generate จาก `expo prebuild` เท่านั้น การแก้ `app.config.ts`
   > อย่างเดียว**ไม่**ทำให้ APK ที่ build ได้เวอร์ชันใหม่ (gradle อ่านค่าจาก build.gradle ตรงๆ)
   > และอย่ารัน prebuild เพื่อ sync เวอร์ชัน (มี gotcha ทำ MainApplication.kt พัง — mobile issue #2)
   > เช็คก่อน sign เสมอ: `aapt dump badging <apk> | head -1` ต้องเห็น versionCode/versionName ใหม่

2. เพิ่ม changelog ใน `src/updates/mobileChangelog.ts`

   - ใช้ข้อความสั้น ชัดเจน สำหรับผู้ใช้
   - ห้ามใส่รายละเอียดด้านความปลอดภัยหรือข้อมูลภายใน

3. ตรวจ TypeScript

   ```bash
   npm run typecheck
   ```

4. Build APK

   ```bash
   cd android
   # SENTRY_DISABLE_AUTO_UPLOAD=true ข้ามการอัปโหลด sourcemap ของ Sentry
   # (ยังไม่ได้ตั้ง org/project/auth-token — ถ้าไม่ตั้ง build จะ fail ที่ SentryUpload).
   # error ยังถูกจับปกติ แค่ stack trace ไม่ map เป็น source code
   SENTRY_DISABLE_AUTO_UPLOAD=true ./gradlew assembleRelease
   cd ..
   ```

   > 💡 อยากได้ stack trace แบบ map เป็นบรรทัดโค้ดจริง: สร้าง Sentry auth token +
   > ตั้ง `organization`/`project` ใน `@sentry/react-native` plugin (app.config.ts)
   > แล้วเอา env var ออก

5. เตรียม release asset — **ต้องเซ็น rotation ทุกครั้ง (ตั้งแต่ v0.3.0)**

   Gradle เซ็นด้วย debug key อย่างเดียว (เซ็น signing lineage เองไม่ได้) จึงต้อง re-sign
   ด้วย `scripts/sign-release.mjs` เสมอ ก่อนแจกจ่าย:

   ```bash
   VERSION=x.y.z
   mkdir -p artifacts
   # อ่านรหัสจาก signing/CREDENTIALS.txt (หรือ GitHub Secret ตอนรันใน CI)
   export RELEASE_KEYSTORE_PASS='<store password>'
   node scripts/sign-release.mjs \
     android/app/build/outputs/apk/release/app-release.apk \
     "artifacts/kubdee-ai-mobile-v${VERSION}.apk"
   shasum -a 256 "artifacts/kubdee-ai-mobile-v${VERSION}.apk"
   ```

   สคริปต์จะเซ็น 2 ชั้น (debug key = v1/v2 backward-compat, production key = v3 + lineage)
   แล้ว verify ให้อัตโนมัติ ถ้า verify ไม่ผ่านจะ exit ทันที

   > ⚠️ **ห้ามแจก APK ที่ออกจาก gradle ตรงๆ** (เซ็น debug ล้วน) — เครื่องที่อัปเดตขึ้น v0.3.0+
   > ไปแล้วจะติดตั้งทับไม่ได้ (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`)
   >
   > ⚠️ **ห้ามทำ `signing/kubdee-release.jks` + รหัสหาย** — หายแล้วอัปเดตแอปไม่ได้ตลอดกาล
   > ผู้ใช้ทุกคนต้องถอนลงใหม่ สำรองไฟล์นี้ + รหัสไว้ที่ปลอดภัย (password manager / secret store)

6. Commit และ push

   ```bash
   git status --short
   git add package.json package-lock.json app.config.ts app.json src/updates/mobileChangelog.ts docs/MOBILE_RELEASE.md scripts/sign-release.mjs
   git commit -m "chore: release mobile v${VERSION}"
   git push origin master
   ```

   > 🔐 `signing/` ถูก gitignore ไว้ (keystore + lineage + credential ไม่เข้า git) — สำรองแยกเอง

7. สร้าง GitHub Release

   ```bash
   gh release create "v${VERSION}" "artifacts/kubdee-ai-mobile-v${VERSION}.apk" \
     --title "v${VERSION}" \
     --notes-file /tmp/kubdee-ai-mobile-release-notes.md
   ```

8. Verify release

   ```bash
   gh release view "v${VERSION}" --json tagName,name,assets
   ```

9. Verify จากแอปจริง

   - เปิด Kubdee AI Mobile
   - ไปเมนู `เช็คอัปเดต`
   - ต้องเห็นเวอร์ชันล่าสุด และดาวน์โหลด APK ได้

## รูปแบบ Release Notes (บังคับ)

- บรรทัดแรกต้องเป็น metadata `versionCode: NNN` (ค่าเดียวกับ `android/app/build.gradle`) — เว็บใช้ตัดสินว่ามีอัปเดตใหม่
- เนื้อหาต้องจัดกลุ่มด้วยหัวข้อ section (`###`) แบบเดียวกับ extension เพราะ `/api/user/releases` ใน `kubdee-ai-web` parse หัวข้อเป็นชนิดการเปลี่ยนแปลง
- ใช้ข้อความเดียวกับที่ใส่ใน `src/updates/mobileChangelog.ts` (type ตรงกัน: fixed → Bug Fixes, added/feature → Features, improved → Improvements, changed → Changes, removed → Removed)
- เว็บเก็บ change สูงสุด 5 รายการแรก — เรียงเรื่องสำคัญที่สุดไว้บนสุด

หัวข้อที่ parser ฝั่งเว็บรู้จัก: `### Features`, `### Improvements`, `### Bug Fixes`, `### Changes`, `### Removed` (หรือคำไทย เพิ่ม / ปรับปรุง / แก้ไข / เปลี่ยนแปลง / ลบ)

## Release Notes Example

```markdown
versionCode: 121

### Bug Fixes
- บางเครื่องปุ่มโพสต์วิดีโอมุมขวาล่างในหน้าบัญชี Shopee Video แสดงเป็นไอคอน + ล้วนจนระบบหาไม่เจอและหยุดโพสต์ ตอนนี้เพิ่มการค้นหาสำรอง ทั้งจับไอคอน + โดยตรงและหาปุ่มกดได้ที่ใกล้มุมขวาล่างที่สุดแทน
```
