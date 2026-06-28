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
   ./gradlew assembleRelease
   cd ..
   ```

5. เตรียม release asset

   ```bash
   VERSION=x.y.z
   mkdir -p artifacts
   cp android/app/build/outputs/apk/release/app-release.apk "artifacts/kubdee-ai-mobile-v${VERSION}.apk"
   shasum -a 256 "artifacts/kubdee-ai-mobile-v${VERSION}.apk"
   ```

6. Commit และ push

   ```bash
   git status --short
   git add package.json package-lock.json app.config.ts app.json src/updates/mobileChangelog.ts docs/MOBILE_RELEASE.md
   git commit -m "chore: release mobile v${VERSION}"
   git push origin master
   ```

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

## Release Notes Example

```markdown
- ปรับหน้าตา Changelog ให้ใกล้เคียง Desktop มากขึ้น
- จัดรายการอัปเดตเป็น timeline พร้อมกลุ่มประเภท
- ปรับ modal เวอร์ชันให้ดูและใช้งานสอดคล้องกันมากขึ้น
```
