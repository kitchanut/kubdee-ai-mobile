# Kubdee AI Mobile Release Checklist

เอกสารนี้เป็น checklist ภายในสำหรับปล่อยเวอร์ชัน Mobile App เท่านั้น release notes ที่ผู้ใช้เห็นควรมีเฉพาะสิ่งที่กระทบการใช้งานจริง

## Version เริ่มต้น

- App version: `0.1.0`
- Tag: `v0.1.0`

## Checklist

1. อัปเดต version ให้ตรงกับ release
2. รัน `npm run typecheck`
3. Build ไฟล์ติดตั้งสำหรับ Android
4. Upload release asset ตาม naming contract ของระบบ
5. Release notes ที่ผู้ใช้เห็นให้เขียนเฉพาะสิ่งที่กระทบการใช้งานจริง
6. ทดสอบจากแอปจริงด้วยเมนู `เช็คอัปเดต`

## ตัวอย่าง release notes สำหรับผู้ใช้

```markdown
- เพิ่มเมนูเช็คอัปเดตแอปจากในหน้าบัญชี
- เพิ่มหน้าเวอร์ชันและประวัติการเปลี่ยนแปลง
- ปรับปรุงการแจ้งเตือนเมื่อมีเวอร์ชันใหม่
```
