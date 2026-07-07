# Code Review — kubdee-ai-mobile

> **วันที่รีวิว:** 7 กรกฎาคม 2026
> **เวอร์ชันที่รีวิว:** v0.2.70 (versionCode 122) · Expo SDK 56
> **ขอบเขต:** ทั้ง codebase — Kotlin native automation, autopilot/WebView, UI/screens, data/services, project health/tooling
> **วิธีรีวิว:** อ่านไฟล์จริง (deep-read ไฟล์ใหญ่ทุกด้าน) + รัน typecheck + diff templates↔android จริง

---

## บันทึกการแก้ไข (Changelog หลังรีวิว)

รายการนี้อัปเดตเมื่อ finding ถูกแก้จริง เพื่อไม่ให้คนอ่านทีหลังเข้าใจผิดว่ายังเปิดอยู่

| วันที่ | เวอร์ชัน | Finding ที่แก้ | สรุป |
|--------|----------|----------------|------|
| 2026-07-07 | **v0.3.0** | **H-1 (keystore) ✅** | ย้ายจาก debug keystore สาธารณะ → production key ส่วนตัว ผ่าน APK signing lineage (key rotation); ผู้ใช้เดิมอัปเดตทับได้ไร้รอยต่อ ข้อมูล local ไม่หาย; เฉพาะ production key เซ็นอัปเดตต่อได้ (Android 13+); ทดสอบ end-to-end บนเครื่องจริง; `scripts/sign-release.mjs` + `docs/MOBILE_RELEASE.md`; keystore อยู่ `signing/` (gitignored) — ดู memory `mobile-signing-key-rotation` |
| 2026-07-07 | — | **Phase 0 guardrail ✅** (H-3, H-4, M-1, M-2 บางส่วน) | `scripts/check-native-drift.mjs` กัน templates↔android drift (H-3); `scripts/check-release.mjs` + version single-source (app.config.ts อ่าน package.json, ลบ dead version/versionCode ใน app.json) (H-4); ESLint (eslint-config-expo v57) + Prettier + auto-fix ลบ dead import 32 ไฟล์, backlog react-hooks เป็น warning (M-2 บางส่วน); `.github/workflows/ci.yml` = typecheck+lint+drift+release ทุก push/PR (M-1 ฝั่ง CI; release.yml ยังไม่ทำ); `docs/DEVELOPMENT.md` + AGENTS.md rules; `npm run verify` |
| 2026-07-07 | **v0.3.1** | **H-2 (observability) ✅ ครบทั้ง 2 ส่วน** | ส่วน 1: `src/lib/telemetry.ts` (seam) + `src/lib/apiError.ts` (`toApiError` แยก network/parse/unknown) wire เข้า auth/api.ts + library/api.ts (catch เลิกกลืน error); ส่วน 2: `@sentry/react-native` เสียบเข้า seam (errors-only, DSN embedded) — ทดสอบ end-to-end บนเครื่องจริง (logcat `Envelope sent successfully` + event เข้า dashboard). ผลพลอยได้: เจอ+แก้ H-3 divergence จริง (plugin ไม่เติม `:automation`) + RECORD_AUDIO เกิน. GOTCHA: release build ต้อง `SENTRY_DISABLE_AUTO_UPLOAD=true` จนกว่าจะตั้ง auth token — ดู memory `mobile-sentry-telemetry` |

> **ค้างอยู่ (ยังไม่แก้):** H-5 ถึง H-18 และ MED/LOW ส่วนใหญ่ — ดูรายละเอียดในหัวข้อ 3 และ Roadmap หัวข้อ 4
> **หมายเหตุ:** react-hooks warnings (refs-in-render/setState-in-effect) = หนี้เดิม H-18/M-20/M-22 lint ตั้งเป็น warning ไว้ จะ ratchet กลับเป็น error เมื่อ refactor Phase 2-4

---

## 0. สรุปผู้บริหาร (TL;DR)

Codebase นี้ **พื้นฐานแข็งแรงกว่าค่าเฉลี่ยมาก** — TypeScript `strict: true` ไม่มี `any` เลยสักจุด, SQLite outbox pattern ระดับ production, token เก็บใน SecureStore ถูกที่, process แยกฝั่ง native + IPC เขียน disk ทันทีทนแอปตาย, accessibility hygiene ดีเยี่ยม, และ institutional knowledge ถูกบันทึกใน comment จำนวนมาก

ปัญหาหลัก **ไม่ใช่ "โค้ดเน่า"** แต่คือความเสี่ยงเชิงระบบ 5 กลุ่ม:

| # | ธีมข้ามทั้งโปรเจกต์ | ทำไมสำคัญ |
|---|---------------------|-----------|
| A | **มองไม่เห็น error ในสนาม** | ไม่มี crash telemetry (Sentry) เลย + catch กลืน error เป็นข้อความ generic → บั๊ก mapping code หน้าตาเหมือน "เน็ตหลุด" |
| B | **ไม่มี test / lint / CI** | 0 test ทั้ง repo, ไม่มี ESLint/Prettier, ไม่มี GitHub Actions → ทุก regression เจอบนเครื่องผู้ใช้ |
| C | **Single-source-of-truth หลุดหลายจุด** | version กระจาย 6 ที่, dual-tree templates↔android ไม่มี guard, fetch/refresh-token 3 กลยุทธ์กระจาย 11 ไฟล์ |
| D | **God files** | 6 ไฟล์เกิน 1,000 บรรทัด (ใหญ่สุด 3,534) กระจุกความเสี่ยง + แก้ยาก |
| E | **ความปลอดภัย** ✅ *(แก้แล้ว v0.3.0)* | ~~release APK เซ็นด้วย debug keystore สาธารณะ~~ → ย้ายเป็น production key + rotation แล้ว (ดูบันทึกการแก้ไขด้านบน) |

**ถ้าทำได้แค่ 3 อย่างในเดือนนี้:** ~~(1) เปลี่ยน release keystore [E]~~ ✅ *ทำแล้ว v0.3.0* → เหลือ (2) วาง CI + sync-guard + version single-source [B,C], (3) เพิ่ม Sentry [A]

---

## 1. ภาพรวมขนาด codebase

| Layer | บรรทัด (โดยประมาณ) | ไฟล์ใหญ่สุด |
|-------|-------------------|-------------|
| UI (screens + components) | ~22,600 | ProductPanel.tsx 1,475 · MediaPanel.tsx 1,281 |
| Kotlin native (dual tree) | ~12,500 ×2 | ShopeePostingFlow.kt 2,622 · ShopeeImportNavigation.kt 1,701 |
| Autopilot + flow-core | ~13,700 | GoogleFlowWebViewRunnerHost.tsx **3,534** |
| Data/services/auth | ~7,700 | LibraryContext.tsx 1,167 · mobileChangelog.ts 884 |

**Top god files** (ควรแตก): `GoogleFlowWebViewRunnerHost.tsx` 3,534 · `ShopeePostingFlow.kt` 2,622 · `ShopeeImportNavigation.kt` 1,701 · `ProductPanel.tsx` 1,475 · `MediaPanel.tsx` 1,281 · `LibraryContext.tsx` 1,167

---

## 2. จุดแข็งที่ควรรักษาไว้ (อย่า refactor ทิ้ง)

- **Native:** process แยก + IPC broadcast scope-by-package + correlate ด้วย `runId` + timeout ครบ + เขียนผลลง JSONL ทันทีทีละรายการ (`KubdeeShopeeImportQueue` ใช้ `FileChannel.lock` + dedupe) → แอปโดนฆ่ากลางคันไม่เสียงาน
- **Native:** `sleepStep` poll `stopRequested` ทุก 250ms + exception ชนิดเฉพาะ → กด Stop แล้วเก็บผลได้เสมอ
- **Native:** fallback ladder หลายกลยุทธ์ (text→resource-id→geometry→พิกัดดิบ) พร้อม comment บันทึกบั๊กจริง (ข้ามปุ่มแชทลอย, Chrome trampoline)
- **Data:** `localProductDb.ts` — expo-sqlite + WAL + tombstone + sync state machine + outbox queue (`UNIQUE(operation, local_id)`) = pattern ระดับ production
- **Data:** TypeScript `strict: true`, grep ทั้ง src พบ `any` = **0**, native/remote payload validate ผ่าน `unknown` + narrowing ครบ
- **Data:** token ใน `expo-secure-store`, cloud transfer idempotent (sha256 dedupe), APK ตรวจ sha256 ก่อนติดตั้ง
- **UI:** design-token จริง (`kd-*` CSS vars + `tokens.ts`), dark mode single-source (`nativeWindColorScheme.set`), `KubdeeText` แยก Thai/Latin font runs, accessibility 193 role + 89 label
- **Autopilot:** `flow-core` เป็น pure TS zero-deps มี README boundary ชัด, WebView RPC bridge id-tagged + timeout ที่ resolve ไม่ hang, baseline-diff result detection, retry ladder ซับซ้อนแต่ถูกต้อง
- **Cross-cutting:** 0 console.log noise, 0 TODO/FIXME debt, git history 279 commit สะอาด, ไม่มี secret หลุด repo, dependency ใช้จริงทุกตัว

---

## 3. FINDINGS จัดกลุ่มตามความรุนแรง

รหัสอ้างอิง: `[K]`=Kotlin native · `[AP]`=Autopilot/WebView · `[UI]`=UI · `[D]`=Data/Services · `[P]`=Project health

### 🔴 HIGH — ควรจัดการก่อน

| # | Finding | หลักฐาน | Fix |
|---|---------|---------|-----|
| **H-1** [P] ✅ **แก้แล้ว v0.3.0 (2026-07-07)** | ~~Release APK เซ็นด้วย debug keystore สาธารณะ — แอปมี accessibility + clipboard + self-update → ใครก็ปลอม APK ติดตั้งทับเป็น "อัปเดต" ได้~~ | ~~`android/app/build.gradle:110-115` ใช้ `signingConfigs.debug`~~ | **ทำจริงแล้ว:** ไม่ได้เปลี่ยน keystore ตรงๆ (จะทำให้ผู้ใช้ต้องถอน) แต่ใช้ **APK signing lineage (key rotation)** — เซ็น 2 ชั้น (debug key v1/v2 backward-compat + production key v3 + lineage) → ผู้ใช้เดิม**อัปเดตทับได้ไร้รอยต่อ ข้อมูลไม่หาย** และเฉพาะ production key เซ็นอัปเดตต่อได้. ดู `scripts/sign-release.mjs` + memory `mobile-signing-key-rotation` |
| **H-2** [D] | **ไม่มี crash/error telemetry เลย** + catch กลืน error เป็นข้อความ generic → บั๊ก mapping code หน้าตาเหมือนเน็ตหลุด; แอปทำ automation ยาวบนเครื่องผู้ใช้ วินิจฉัยจาก in-app log อย่างเดียว | grep `sentry\|crashlytics` = 0; `auth/api.ts:302-309` คืน generic string ทุก error | เพิ่ม `@sentry/react-native` + central `toApiError()` แยก network/HTTP/parse; report ก่อน map เป็นข้อความไทย |
| **H-3** [P/K] | **Dual-tree templates↔android ไม่มี guard** — `expo run:android` ไม่ prebuild ใหม่ → แก้ android/ ตรงๆ build ผ่านจนวันที่ prebuild แล้วโดนเขียนทับเงียบ (incident ที่เคยเกิด v0.2.70) | `.gitignore:43` ignore `/android` แต่ 26 ไฟล์ force-add; template array มือ 19 ไฟล์ | script `check:native-drift` (render + diff) ใน CI + กติกา "แก้ templates เท่านั้น" ใน AGENTS.md |
| **H-4** [P] | **Version กระจาย 6 ที่ ไม่มี guard** | package.json, package-lock ×2, app.config.ts, app.json, mobileChangelog.ts, build.gradle(local) | app.config.ts อ่าน package.json; ลบ version จาก app.json; `npm version patch`; `scripts/check-release.mjs` assert ตรงกัน |
| **H-5** [D] | **ไม่มี fetch wrapper กลาง** — 11 ไฟล์ยิง fetch เอง + refresh-token 3 กลยุทธ์ต่างกัน + **ไม่มี mutex** (interval 5 นาที + sync + cloud transfer refresh พร้อมกันได้) → ถ้า backend เปลี่ยนเป็น rotating token ผู้ใช้โดน logout สุ่ม | fetch ใน 11 ไฟล์; refresh block copy-paste 4 ครั้งใน `LibraryContext.tsx:748-756,890-897,979-985,1062-1068` | `src/auth/apiClient.ts` เดียว: header มาตรฐาน + single-flight refresh + retry 401 |
| **H-6** [D] | **Sync queue ไม่มี backoff/cap** — poison job (payload ที่ server ปฏิเสธถาวร) retry ทุก 30 วิ block job อื่นตลอดกาล | `localProductDb.ts:795-819` `next_attempt_at` คงที่ 30s, `attempts` ไม่เคยถูกใช้ | exponential backoff + `dead` state เมื่อ attempts เกิน N + แยก delete-fail ไม่ block upsert |
| **H-7** [AP] | **ไม่มี WebView crash recovery** — renderer ตายกลางคัน (memory pressure) → action fail ผ่าน timeout เท่านั้น, run loop ยิง JS เข้า WebView ที่ตายแล้ว, ผู้ใช้เห็น timeout มั่วๆ ไล่ยาว | `FlowWebView.tsx:264-324` ไม่มี `onRenderProcessGone`/`onContentProcessDidTerminate` | เพิ่ม handler → reject pending ด้วย `WEBVIEW_CRASHED` + remount + retry step หนึ่งครั้ง |
| **H-8** [AP] | **Stop ไม่ถูก honor ระหว่าง sleep** — worst case รอ ~5 นาที (`delay_between_products` 300s preset slowest) | `sleep` เป็น setTimeout ธรรมดา `runnerPlanning.ts:11`; checkStop ทำงานเฉพาะระหว่าง await | `sleep(ms, signal)` ที่ reject ด้วย stop token + race กับ runAction |
| **H-9** [AP] | **base64 image cache โตไม่จำกัด** — โหมด infinite loop วน 9,999 รอบ สะสม multi-MB string ต่อ product ต่อรอบ → OOM บนมือถือ | `runnerReferences.ts:42-44` `latestGeneratedImageDataUrlsRef` key `round:productId` clear แค่ตอน start/end | key ด้วย product อย่างเดียว หรือ evict รอบ `< currentRound` |
| **H-10** [K] | **template parameterization เป็นของหลอก** — จ่ายต้นทุน dual-tree เต็มๆ เพื่อความยืดหยุ่นที่ไม่มีจริง | 12 ไฟล์ hardcode `import ai.kubdee.mobile.R`; `__TARGET_PACKAGE__` ไม่มีไฟล์ไหนใช้; `com.shopee.th` hardcode 3 จุด | เลิก render `__PACKAGE_NAME__` — templates ประกาศ package ตรงๆ, plugin copy verbatim |
| **H-11** [K] | **ค่าคงที่นิยาม 2 ชุดแบบ shadow** — แก้ regex ที่ models แล้วพฤติกรรม import หลักไม่เปลี่ยน = กับดัก | `KubdeeAccessibilityService.kt:111-216` (companion) vs `ShopeeAutomationModels.kt:8-152` (top-level) — `PRICE_REGEX`, `SHOPEE_LIKED_TEXTS` ฯลฯ ~15 ตัว | ลบชุด companion ทั้งหมด (top-level มองเห็นจากใน class อยู่แล้ว) |
| **H-12** [K] | **Thai UI string ~401 ค่ากระจาย inline 15 ไฟล์** — Shopee ออกเวอร์ชันใหม่ต้อง grep ทั้ง 12,500 บรรทัด | `ShopeePostingFlow.kt` 233 บรรทัด, `ShopeeImportNavigation.kt` 116 บรรทัด | `object ShopeeUiLexicon` จัดตามหน้าจอ + comment ระบุเวอร์ชัน Shopee ที่ทดสอบ |
| **H-13** [UI] | **MediaPanelModals รับ ~60 props** (รวม 12 raw setState + ฟังก์ชัน pure ที่ import อยู่แล้วแต่ส่งเป็น prop) — แก้ modal ต้องแก้ 3 ที่ | `MediaPanel.tsx:1209-1278` → `media-panel/modals.tsx:23-89` | แตกเป็น 6 modal components แต่ละตัวถือ state เอง + context เล็ก |
| **H-14** [UI] | **God components** — MediaPanel 1,281 บรรทัด (34 useState) + ProductPanel 1,475 (17 useState, inline 2 modal ~300 บรรทัด) | ProductPanel edit modal `:1158-1335`, import modal `:1337-1459` | แตกเป็น hook (`useCloudTransfer`, `useMediaEditForm`) + modal แยกไฟล์ |
| **H-15** [UI] | **โค้ดตาย ~3,400 บรรทัด + naming trap** — `ImageWorkspaceScreen.tsx` (743) & `ImageCreateScreen.tsx` (431) ไม่ถูก import; 21/40 ไฟล์ `ui/*` (2,230 บรรทัด) ไม่ถูกใช้; alias ชนกับไฟล์ตาย | `KubdeeMobileApp.tsx:26` import จาก `ImageWorkspaceLibraryStyleScreen` แต่ตั้งชื่อ `ImageCreateScreen` | ลบไฟล์ตาย (**ต้องขออนุญาตก่อนตามกติกา**) + prune ui/ |
| **H-16** [UI] | **Toast โดน Modal บัง (บั๊กจริงบน Android ที่ทีมบันทึกเอง) ไม่ handle 3 จุด** | ProductPanel edit modal `:411,441-447`; cloud inbox `MediaPanel.tsx:370-382`; download error `:563` | ใส่ `<KubdeeToaster>` ใน Modal ทุกตัวที่ยิง toast |
| **H-17** [D] | **SHA-1 เขียนมือ ~110 บรรทัด** ทั้งที่มี expo-crypto ใช้อยู่แล้ว | `LibraryContext.tsx:178-288` `utf8Bytes/rotateLeft/sha1Hex` | แทนด้วย `expo-crypto` (`cloudTransferService.ts:228-232` ใช้ `Crypto.digest` อยู่แล้ว) |
| **H-18** [AP] | **God component autopilot** — `GoogleFlowWebViewRunnerHost.tsx` 3,534 บรรทัด, `runProductStep` เป็น useCallback เดียว **1,746 บรรทัด**, `emit()` boilerplate ซ้ำ 84 ครั้ง (~900 บรรทัด) | `:1344-3090` multi-scene branch ~945 บรรทัด | context-bound emitter + แตก workflow เป็น module (ดู Roadmap) |

### 🟠 MED — ควรทำต่อจาก HIGH

| # | Finding | ด้าน |
|---|---------|------|
| M-1 | **ไม่มี CI** ทั้งที่ desktop sibling ใช้ Actions อยู่แล้ว → `ci.yml` (typecheck + drift + lint) + `release.yml` (build APK on tag) | [P] |
| M-2 | **ไม่มี ESLint/Prettier** → `expo lint` + `eslint-plugin-unused-imports` (MediaPanel มี ~20 dead import เป็นหลักฐาน) | [P][UI] |
| M-3 | **planning/counting logic ซ้ำ verbatim 2 module** + progress คำนวณ 3 reducer อิสระ → drift ทำเลขผิดเงียบ | [AP] |
| M-4 | **theme prop-drilled 313 ครั้ง** ทั้งที่ `useKubdeeTheme()` มีอยู่แต่ใช้ 0 ครั้ง | [UI] |
| M-5 | **MediaPanel/SimpleListPanel render library ทั้งก้อนไม่ virtualize** + 0 `React.memo` ทั้ง codebase → tap ทีเดียว re-render ทุก card | [UI] |
| M-6 | **navigation เป็น switch มือ** → screen unmount เสีย state ทุกครั้งที่สลับ tab (บังคับให้เกิด `*Request` workaround); tab list sync มือ 3 ที่ | [UI] |
| M-7 | **KubdeeMobileApp ปน 4 service** (theme/profile persist/APK update/changelog) ใน shell 761 บรรทัด | [UI] |
| M-8 | **78 hardcoded hex** นอก token file (เช่น `theme.isDark ? '#111827' : white` ซ้ำหลายจุด) | [UI] |
| M-9 | **สอง Text/design system** — `ui/text.tsx` (shadcn) bypass Thai font-run ของ KubdeeText | [UI] |
| M-10 | **bottom-sheet scaffolding copy-paste ~10 ครั้ง** → extract `<BottomSheetModal>` | [UI] |
| M-11 | **dedupe identity ไม่บังคับที่ schema** — บั๊กสินค้าซ้ำอดีตซ่อมด้วย loop ฝั่งแอป ไม่ใช่ UNIQUE constraint | [D] |
| M-12 | **`SCHEMA_VERSION` เขียนแต่ไม่เคยอ่าน** — ไม่มี migration runner จริง (2 db คนละแนวทาง) | [D] |
| M-13 | **dual source of truth ใน affiliate_products** (`product_json` blob vs extracted column); parse fail = แถวหายเงียบ | [D] |
| M-14 | **AccessibilityBridge typing มือล้วน** (drift กับ Kotlin ตรวจไม่ได้), guard ซ้ำ ~25 จุด, subscriber 3 ตัวโค้ดซ้ำ, ปน 3 domain | [D] |
| M-15 | **mobileChangelog.ts 59% เป็น data ฝังโค้ด** (523 บรรทัด array) + parser 3 format ปน cache I/O | [D] |
| M-16 | **SecureStore เก็บ JSON โตไม่จำกัด** (deleted-profile map, limit 2KB) ทั้งที่ไม่ใช่ secret | [D] |
| M-17 | **hash อ่านไฟล์ทั้งก้อนเข้า memory** (วิดีโอ 40MB + APK) → spike บนเครื่อง low-end | [D] |
| M-18 | **`buildActionScript` monkey-patch `HTMLElement.prototype.click` global** ต่อ action + มี interleaving bug ทำ prototype ค้าง | [AP] |
| M-19 | **field diagnosability หยุดที่ Thai log ephemeral** — cap 120 entry, ไม่ persist, selector fail ไม่มี DOM context | [AP] |
| M-20 | **`waitForStepResult` state machine 300 บรรทัดใน component** (8 mutable local) ทดสอบไม่ได้ | [AP] |
| M-21 | **`generatedMediaStore` 2 source of truth + mount-time write storm** (O(n) writes ตอน boot) | [AP] |
| M-22 | **`useAutoPilotController` 977 บรรทัด, 30-method return, mega-effect re-subscribe ทุก product edit** | [AP] |
| M-23 | **composer/submit heuristics copy-paste 3+ body** — Google เปลี่ยน layout ต้องแก้ 3 ที่ | [AP] |
| M-24 | **Optimistic success ไม่ถูกรายงาน** — `goToShopeeMeTab`/toggle verify fail คืน true; result JSON ไม่มี warnings | [K] |
| M-25 | **`seenCandidateKeys` one-shot ถาวร** — enrich fail ครั้งเดียว = ข้ามสินค้าทั้ง run (ตรงกับบั๊กที่แก้ v0.2.70 บางส่วน) | [K] |
| M-26 | **thread-safety ครึ่งทาง** — `automationTapIndicator*` เขียน worker อ่าน main ไม่ sync; check-then-act race ใน dispatch | [K] |
| M-27 | **god files + primitive อยู่ผิดไฟล์** — `ShopeePostingFlow.kt` 83 ฟังก์ชัน ปน 5 เรื่อง; `dp()`/`performBack` อยู่ใน AutomationOverlay | [K] |
| M-28 | **magic numbers ไร้ชื่อมหาศาล** — sleep 121 จุด, screen fraction ~200 จุด, **px ดิบปน dp** (`gap > 340` px density-dependent) | [K] |

### 🟡 LOW — เก็บกวาดเมื่อมีโอกาส

- **[P]** dead code ~460 บรรทัดใน `withKubdeeAccessibility.js` (`accessibilityServiceKt`/`accessibilityModuleKt` ไม่ถูกเรียก); bug escape `'<resources>\\n</resources>'`; ไม่มี README/DEVELOPMENT.md; NativeWind gotcha docs อยู่ root ควรย้าย docs/; `eas.json` มีแต่ไม่ได้ใช้ (สับสน)
- **[K]** dead Kotlin functions (`switchToShopeePartnerLikedView` ฯลฯ — มุมมองพาร์ทเนอร์เลิกใช้?); `resolveShopeeUrl` ยิง network sync กลางลูป scrape; indent เพี้ยน (ร่องรอย merge มือ 2 tree); log routing ผูกข้อความไทย; ไม่มี run log บน disk
- **[D]** helper ซ้ำข้ามไฟล์ (`cleanText` 6+ ไฟล์, `hashString`, `sha256File` 3 ที่, mime table 2 ที่) → `lib/strings.ts`/`lib/hash.ts`; `mockData.ts` (198 บรรทัด) ไม่ถูก import; `fetchAffiliateProducts` limit=5000 ไม่มี pagination; URL hardcode ไม่มี staging; profile เป็น cloud-only ไม่มี offline cache
- **[UI]** circular import `media-panel/modals.tsx ↔ ./index`; `panelCopy` half-adopted; ProfileScreen ใช้ `TouchableOpacity` สวนทาง Pressable convention; error-banner markup ซ้ำ
- **[AP]** `src/automation/**` (~150 บรรทัด prototype) + `selectRecentImageOrThrow` (88) dead; overlay log key ชนกัน same-ms; `runnerPrompts.ts` (923) ปน template+parse+fetch

---

## 4. Roadmap ปรับปรุง (แบ่งเฟส · เรียงตาม ROI ต่อความเสี่ยง)

หลักการ: **guardrail ก่อน → เก็บของตาย → ตัดความเสี่ยงสนาม → แตกไฟล์ → ชำระหนี้โครงสร้าง**
ทุกเฟสตรวจรับได้ด้วย `npm run typecheck` + sync-check + Kotlin compile โดย automation ที่ทำงานอยู่ไม่เปลี่ยนพฤติกรรมจนถึงเฟสท้ายๆ

### Phase 0 — Guardrail (ครึ่งวัน–1 วัน · Effort S · เสี่ยงต่ำสุด ทำได้เลย)
เป้าหมาย: หยุดเลือดก่อน ไม่แตะ logic
1. `scripts/check-native-drift.mjs` — render templates + diff android/ → exit 1 เมื่อ drift **[H-3]**
2. `scripts/check-release.mjs` — assert version ตรงกันทุกที่ + changelog format **[H-4]**
3. app.config.ts อ่าน `require('./package.json').version` + ลบ version จาก app.json + ใช้ `npm version patch` **[H-4]**
4. `expo lint` + prettier + script `lint` **[M-2]**
5. `.github/workflows/ci.yml` — npm ci → typecheck → drift → release-check → lint **[M-1]**
6. เขียนกติกา "แก้ Kotlin ที่ templates เท่านั้น" ใน AGENTS.md + README/DEVELOPMENT.md **[H-3, LOW]**

### Phase 1 — ความปลอดภัย + observability (1–2 วัน · Effort S-M)
7. ~~**Release keystore จริง**~~ ✅ **ทำแล้ว v0.3.0** — ใช้ key rotation (lineage) แทน ไม่ต้องให้ผู้ใช้ถอนแอป **[H-1]**
8. `release.yml` — build APK บน Actions on tag `v*` + inject keystore จาก Secrets **[M-1]** *(ยังไม่ทำ — ตอนนี้เซ็น local ผ่าน `scripts/sign-release.mjs`; ย้ายขึ้น CI ได้เลยโดยใช้ script เดิม)*
9. `@sentry/react-native` + central `toApiError()` แยก network/HTTP/parse **[H-2]**
10. report แถว JSON parse fail แทน drop เงียบ **[M-13]**

### Phase 2 — ตัดความเสี่ยงสนาม (2–3 วัน · Effort M · behavior change ที่ตั้งใจ)
11. abortable `sleep(ms, signal)` + WebView crash handler + remount retry **[H-7, H-8]**
12. round-scoped eviction ของ image cache **[H-9]**
13. sync queue backoff + dead-letter + แยก delete-fail **[H-6]**
14. เก็บของตาย: dead JS 460 บรรทัด, dead Kotlin, `src/automation/**`, `mockData.ts`, ui/* ที่ไม่ใช้ (**ขออนุญาตลบก่อน**) **[H-15, LOW]**

### Phase 3 — API client + fetch เดียว (2–3 วัน · Effort M · ปลดล็อกงานอื่น)
15. `src/auth/apiClient.ts` — header มาตรฐาน + single-flight refresh + retry 401 **[H-5]**
16. migrate ทุก fetch มาใช้ตัวเดียว → ลบ refresh block ซ้ำ 4 ครั้งใน LibraryContext **[H-5]**

### Phase 4 — แตก god files + test ชุดแรก (1–2 สัปดาห์ · Effort M-L)
17. `<BottomSheetModal>` + `<ModalFooterActions>` → sweep library modals (แก้ toast bug ไปด้วย) **[H-16, M-10]**
18. แตก MediaPanel (`useCloudTransfer`/`useMediaEditForm` + 6 modal) & ProductPanel (edit/import modal + `useShopeeImportFlow`) **[H-13, H-14]**
19. แตก LibraryContext: pure logic → `shopeeIdentity.ts`/`productSyncService.ts` + SHA-1→expo-crypto + state/actions context **[H-17]**
20. autopilot: context-bound emitter (ลด ~900 บรรทัด boilerplate) + extract `stepResultPoller.ts` **[H-18, M-20]**
21. Vitest + test แรกให้ `flow-core` (selector/action-body) + changelog parser + `runnerPrompts` parser **[B]**
22. Kotlin: `object ShopeeParsers` (ถอด receiver) + JUnit ครอบ `extractShopeeProductIdFromResolvedUrl`/`PRICE_REGEX`/`isProductNameCandidate` **[K test]**

### Phase 5 — ชำระหนี้โครงสร้าง (ต่อเนื่อง · Effort L · ทำหลังมี test)
23. Kotlin single-source: เลิก render `__PACKAGE_NAME__` → templates เป็น Kotlin แท้; ระยะยาวย้ายเป็น Expo local module (dual tree หายถาวร) **[H-10]**
24. `ShopeeUiLexicon` (string 401 ค่า) + `ShopeeTuning` (magic numbers) + px→dp **[H-12, M-28]**
25. ลบ constants companion ที่ shadow **[H-11]**; generic `walkNodes`/`setShopeeToggleBestEffort`/`runAutomationWorker` **[M-27]**
26. migration runner กลาง + partial UNIQUE index บน product identity + regression test บั๊กซ้ำ **[M-11, M-12]**
27. progress accounting เดียว + แตก `useAutoPilotController` เป็น 3 hook **[M-3, M-22]**
28. navigation: tab registry เดียว (พิจารณา react-navigation ถ้า sub-nav โตต่อ) + แตก 4 service hook จาก shell **[M-6, M-7]**
29. theme: adopt `useKubdeeTheme()` leaf-first + token `textInverse`/badge + sweep 78 hex **[M-4, M-8]**
30. field telemetry: persisted run report + selector-miss DOM digest (ทั้ง JS & Kotlin) **[M-19]**

---

## 5. Quick wins ทำได้วันนี้ (ครึ่งวัน · ตัดความเสี่ยง human-error > ครึ่ง)

1. `check-native-drift` + `check-release` script (2 ไฟล์ node ธรรมดา) **[H-3, H-4]**
2. ลบ version ซ้ำใน app.json + app.config.ts อ่าน package.json **[H-4]**
3. ลบ dead JS 460 บรรทัดใน config plugin **[LOW]**

ทั้ง 3 อย่างยังไม่ต้องแตะ CI, ไม่แตะ Kotlin/TS logic เลย

---

## 6. เรื่องที่ต้องตัดสินใจเชิงนโยบายก่อนลงมือ

| เรื่อง | ทำไมต้องตัดสินใจก่อน |
|--------|---------------------|
| ~~**H-1 เปลี่ยน keystore**~~ ✅ **จบแล้ว v0.3.0** | แก้ด้วย key rotation (lineage) — ไม่ต้อง reinstall, ข้อมูลไม่หาย. **พันธะใหม่ที่เกิดขึ้น:** ห้ามทำ keystore `signing/` หาย + ทุก release ต้องเซ็นผ่าน `scripts/sign-release.mjs` |
| **ลบไฟล์ตาย** (H-15, dead Kotlin, mockData) | กติกาโปรเจกต์ห้ามลบไฟล์โดยไม่ขออนุญาต — ต้องยืนยันรายการก่อน |
| **Kotlin single-source (H-10)** | เลือกระหว่าง "templates เป็น Kotlin แท้ + copy verbatim" (ถูก/เสี่ยงต่ำ) vs "Expo local module" (dual tree หายถาวร แต่ต้องย้าย R reference + register package) |

---

*รายงานนี้สังเคราะห์จากการรีวิว 5 ด้านคู่ขนาน อ่านไฟล์จริงทุกด้าน + ตรวจสอบ (typecheck ผ่าน, templates↔android sync 100% ณ วันที่รีวิว) — ทุก finding มี file:line อ้างอิงในหัวข้อ 3*
