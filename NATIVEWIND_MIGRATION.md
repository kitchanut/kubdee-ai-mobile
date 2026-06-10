# NativeWind Migration Guide (experiment/nativewind-migration)

Goal: convert ALL styling from `StyleSheet.create` to NativeWind `className`.
Foundation is already in place: tailwind.config.js (kd-* tokens), global.css
(CSS vars light/dark), babel/metro/tsconfig wired, `KubdeeText` accepts
className, `KubdeeMobileApp.tsx` is a converted reference example.

## CRITICAL RULES

1. **NEVER use function-form style on Pressable** — `style={({ pressed }) => ...}`
   is silently DROPPED by NativeWind's babel interop (known bug, the reason this
   branch exists). Use `className` with `active:` / `disabled:` variants instead:

   ```tsx
   // BEFORE
   <Pressable style={({ pressed }) => [styles.btn, { backgroundColor: theme.card, opacity: pressed ? 0.7 : 1 }]}>

   // AFTER
   <Pressable className="h-[34px] flex-row items-center justify-center gap-2 rounded-kd-lg bg-kd-card active:opacity-70">
   ```

2. **Do NOT change component props/interfaces.** Keep the `theme` prop flowing
   exactly as-is. Use it ONLY for values className cannot express (see rule 5).
   This prevents conflicts — other agents convert sibling files in parallel.

3. **Only convert the files assigned to you.** Do not touch other files, do not
   run npm install, do not start/stop Metro, do not commit.

4. **Remove the `StyleSheet.create` block** (and the `StyleSheet` import) once
   all its styles are converted in your file.

5. **Allowed `style={}` escape hatches** (keep as small inline objects):
   - shadow* props (shadowColor/Offset/Opacity/Radius) + elevation
   - SVG gradient stops, lucide icon `color=` / `size=` props (values from `theme`)
   - truly dynamic computed values (e.g. progress bar `width: pct + '%'`)
   - `includeFontPadding: false` → just DELETE it (KubdeeText handles fonts;
     do not carry it over)

## TOKEN MAPPING

Colors (light/dark switch automatically via CSS vars — NO `dark:` needed):
- `theme.screen` → `bg-kd-screen` | `theme.panel` → `bg-kd-panel`
- `theme.panelMuted` → `bg-kd-panel-muted` | `theme.card` → `bg-kd-card`
- `theme.cardMuted` → `bg-kd-card-muted` | `theme.input` → `bg-kd-input`
- `theme.tabBar` → `bg-kd-tab-bar` | `theme.active` → `bg-kd-active`
- `theme.border` → `border-kd-border` | `theme.borderStrong` → `border-kd-border-strong`
- `theme.text` → `text-kd-text` | `theme.textMuted` → `text-kd-text-muted`
- `theme.textSubtle` → `text-kd-text-subtle` | `theme.white` → `text-white`/`bg-white`
- accents: `theme.blue/orange/emerald/cyan/amber/red` → `*-kd-blue` etc.
- soft tones: `theme.cyanSoft` → `bg-kd-cyan-soft` (same for orange/emerald/amber/red)

Dynamic patterns:
- `alpha(theme.cyan, 0.38)` → `border-kd-cyan/40` (opacity modifier, round to nearest 5)
- `theme.isDark ? X : Y` in styles → `dark:` variant: `bg-gray-100 dark:bg-kd-card-muted`
- conditional styles → template className: `` className={`flex-1 ${active ? 'bg-kd-cyan-soft' : 'bg-kd-card-muted'}`} ``

Radii / typography (match tokens.ts):
- radius 4/6/8/10 → `rounded-kd-sm` / `rounded-kd-md` / `rounded-kd-lg` / `rounded-kd-xl`
- fontSize 9/10/11/12/14/18 → `text-kd-tiny` / `text-kd-micro` / `text-kd-caption` / `text-kd-body` / `text-kd-label` / `text-kd-title`
- fontWeight '500'/'600'/'700'/'800'/'900' → `font-medium`/`font-semibold`/`font-bold`/`font-extrabold`/`font-black`
- lineHeight 13 → `leading-[13px]`, letterSpacing 0.8 → `tracking-[0.8px]`

Layout (standard Tailwind, RN flavor):
- `flexDirection: 'row'` → `flex-row`; `alignItems: 'center'` → `items-center`
- `justifyContent: 'space-between'` → `justify-between`; `flex: 1` → `flex-1`
- `gap: 8` → `gap-2`; odd values → `gap-[7px]`; padding/margin same idea (`px-2.5` = 10)
- exact sizes → `h-[34px] w-[34px]`, `minHeight: 0` → `min-h-0`
- `position: 'absolute'` → `absolute`, offsets → `right-3 top-[74px]`
- `overflow: 'hidden'` → `overflow-hidden`, `alignSelf: 'flex-start'` → `self-start`
- `transform: [{ translateY: 1 }]` → `translate-y-[1px]`

KubdeeText (`@/components/ui/KubdeeText`): supports className directly —
`<Text className="text-kd-body font-semibold text-kd-text">`. Font family is
automatic (Thai/Latin), driven by the resolved fontWeight.

## VERIFY (per file)

1. No `StyleSheet.create`, no function-form Pressable styles left in your files.
2. `npx tsc --noEmit` passes.
3. Report: files converted, classNames notable decisions, any escape hatches kept.
