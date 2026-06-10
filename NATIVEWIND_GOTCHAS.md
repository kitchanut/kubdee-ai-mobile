# NativeWind Gotchas — ปัญหาที่เจอจริงและวิธีรับมือ

> บันทึกจากการ migrate ทั้งแอปเป็น NativeWind 100% (branch `experiment/nativewind-migration`, มิ.ย. 2026)
> ทั้ง 2 ข้อเป็นปัญหาที่ **พังแบบเงียบๆ ไม่มี error เตือน** — อ่านก่อนแก้ UI ทุกครั้ง

---

## ⛔ ข้อ 1: ห้ามใช้ Pressable function-form style เด็ดขาด

**เวอร์ชันที่เจอ:** nativewind 4.2.5 (เวอร์ชันล่าสุด ณ มิ.ย. 2026) / RN 0.85 / Expo SDK 56

### อาการ

`Pressable` ที่เขียน style แบบ function จะโดน **กลืน style ทิ้งทั้งก้อน** ตอน render —
layout แตกหมด (flexDirection/alignItems/ขนาด หายเกลี้ยง) โดยไม่มี error หรือ warning ใดๆ

ตัวอย่างที่เคยพัง: เมนูใน avatar popover — icon กับข้อความแตกคนละบรรทัดชิดซ้าย
เพราะ `flexDirection: 'row'` + `justifyContent: 'center'` ไม่ถูก apply

### สาเหตุ

babel plugin ของ NativeWind (`nativewind/babel`) wrap ทุก JSX element ด้วย css-interop
ซึ่งจัดการ style prop ที่เป็น **function** (`({ pressed }) => [...]`) ไม่ได้ —
แม้ component นั้นจะไม่ได้ใช้ `className` เลยก็โดนด้วย

### วิธีที่ถูกต้อง

```tsx
// ❌ ห้าม — style โดนกลืนทิ้งเงียบๆ ทั้งก้อน
<Pressable
  style={({ pressed }) => [
    styles.button,
    { backgroundColor: theme.card, opacity: pressed ? 0.7 : 1 },
  ]}
>

// ✅ ใช้ className + active:/disabled: variants แทน
<Pressable className="h-[34px] flex-row items-center justify-center gap-2 rounded-kd-lg bg-kd-card active:opacity-70 disabled:opacity-45">
```

### Checklist ก่อน merge ทุกครั้ง

```bash
# ต้องได้ 0 เสมอ
grep -rn "style={({ pressed })" src App.tsx --include="*.tsx" | wc -l
```

---

## 🔄 ข้อ 2: เพิ่ม className ใหม่ตอน Metro รันอยู่ → style หายทั้งจอ

### อาการ

หลังเพิ่ม class ที่ **ไม่เคยมีในโปรเจคมาก่อน** (เช่น `h-[70px]`, `bg-kd-cyan/40`)
ระหว่างที่ Metro dev server รันค้างอยู่ — หน้าจอ render โดยไม่มี style เลย:
รูปขยายเต็มจอ, layout เรียงคอลัมน์ชิดซ้าย, เหมือนแอปพังทั้งแอป

จุดหลอก: **โค้ดไม่ผิดเลย** typecheck ผ่าน bundle ก็ผ่าน — เผลอไล่หาบัคในโค้ดตัวเองนานมาก

### สาเหตุ

Tailwind JIT compile CSS จากการสแกน source ตอน Metro start
class ใหม่ที่เพิ่มภายหลังอาจไม่ถูก recompile เข้า CSS ทำให้ className resolve เป็น "ไม่มี style"

### วิธีแก้

```bash
# restart Metro แบบล้าง cache เท่านั้นถึงจะหาย
npx expo start --dev-client -c
```

### กฎจำง่ายๆ

- แก้ค่าใน class เดิมที่มีอยู่แล้ว → Fast Refresh ปกติ ✅
- **เพิ่ม class ใหม่ที่ไม่เคยมี → ถ้าจอเพี้ยน ให้ restart `-c` ก่อนเสียเวลาไล่บัค** ⚠️

---

## บริบทเพิ่มเติม

- กติกาการเขียน/แปลง style ทั้งหมดอยู่ที่ [NATIVEWIND_MIGRATION.md](./NATIVEWIND_MIGRATION.md)
- `master` ยังเป็น StyleSheet ล้วน (ไม่มี NativeWind) — สลับกลับได้ทุกเมื่อ
