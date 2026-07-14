#!/usr/bin/env node
/**
 * Guard: ตรวจว่า Google Flow page-action scripts (flow-core) ยังเป็น JavaScript
 * ที่ parse ได้จริงหลังผ่าน template literal ของ TS
 *
 * ทำไมต้องมี: action body เขียนเป็น template literal — regex escape แบบ `\/` หรือ `\s`
 * จะถูก JS กลืนเหลือ `/` และ `s` เงียบๆ เช่น `match(/\/project\//)` กลายเป็น
 * `match(//project//)` = comment → ทั้ง script เป็น SyntaxError → injectJavaScript
 * ใน WebView ล้มเหลวแบบเงียบสนิท (ไม่มี log, ไม่มี result, รอจน timeout)
 * — เกิดจริงกับ prepareProjectUi เมื่อ 2026-07-14
 *
 * ตรวจ 2 ชั้น:
 *  1. Parse test: สร้าง script เต็มด้วย buildActionScript แล้ว new Function()
 *     (V8 — engine ตระกูลเดียวกับ Chromium WebView)
 *  2. Escape lint: หา single-backslash escape (\s \d \w \b \/ ฯลฯ) ในไฟล์ body
 *     ที่ template literal จะกลืน — บางตัว parse ผ่านแต่พฤติกรรมผิด (เช่น /\s+/
 *     กลายเป็น /s+/) ต้องเขียนเป็น \\s เสมอ
 */
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const root = path.dirname(fileURLToPath(import.meta.url));
const flowCoreDir = path.join(root, "..", "src", "flow-core");

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`✗ ${message}`);
};

// --- ชั้นที่ 2: escape lint บนไฟล์ต้นฉบับ ---------------------------------
// จับ backslash เดี่ยว (ไม่ใช่ \\) ตามด้วยตัวที่ใช้ใน regex บ่อยและ template กลืน
const BAD_ESCAPE = /(?<!\\)\\([sdwbSDWB/])(?!\\)/g;

function listTsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listTsFiles(full));
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const sourceFiles = listTsFiles(flowCoreDir);
for (const file of sourceFiles) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const match of line.matchAll(BAD_ESCAPE)) {
      const before = line[match.index - 1];
      if (before === "\\") continue;
      fail(
        `${path.relative(process.cwd(), file)}:${index + 1} มี escape เดี่ยว \\${match[1]} ` +
          `ใน template literal (จะถูกกลืนเหลือ "${match[1]}") — เขียนเป็น \\\\${match[1]} แทน`,
      );
    }
  });
}

// --- ชั้นที่ 1: transpile flow-core แล้ว parse-test ทุก action ------------
const outDir = mkdtempSync(path.join(tmpdir(), "flow-core-check-"));
try {
  try {
    execFileSync(
      process.execPath,
      [
        require.resolve("typescript/bin/tsc"),
        "--outDir",
        outDir,
        "--module",
        "commonjs",
        "--target",
        "es2020",
        "--moduleResolution",
        "node",
        "--esModuleInterop",
        "--skipLibCheck",
        "--ignoreConfig",
        ...sourceFiles,
      ],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
  } catch {
    // type error ไม่ใช่หน้าที่ของ guard นี้ (npm run typecheck ดูแลอยู่แล้ว) —
    // ขอแค่ tsc emit JS ออกมาให้ parse-test ได้ก็พอ
  }

  // tsc วาง output ตามโครง src/ เดิม — หา pageActions.js ที่ transpile แล้ว
  const compiled = listJsFiles(outDir).find((f) =>
    f.endsWith("pageActions.js"),
  );
  if (!compiled) throw new Error("ไม่พบ pageActions.js หลัง transpile");
  const { buildActionScript, getActionBody } = require(compiled);

  // ดึงรายชื่อ action จาก union type ใน pageActions.ts — action ใหม่ถูกตรวจอัตโนมัติ
  const pageActionsSrc = readFileSync(
    path.join(flowCoreDir, "pageActions.ts"),
    "utf8",
  );
  const unionMatch = pageActionsSrc.match(
    /export type FlowActionName =([\s\S]*?);/,
  );
  const actionNames = unionMatch
    ? [...unionMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    : [];
  if (actionNames.length === 0) {
    fail(
      "อ่านรายชื่อ action จาก FlowActionName ใน pageActions.ts ไม่ได้ — เช็ค regex ใน script นี้",
    );
  }

  for (const action of actionNames) {
    if (typeof getActionBody(action) !== "string") {
      fail(
        `action "${action}" ไม่มี body — sync รายชื่อใน check script กับ pageActions.ts`,
      );
      continue;
    }
    const script = buildActionScript("act_check", action, {});
    try {
      // แค่ parse ไม่ execute — SyntaxError คือสิ่งที่ WebView จะเจอแบบเงียบๆ
      new Function(script);
    } catch (error) {
      fail(
        `action "${action}" มี SyntaxError หลังประกอบ script: ${error.message}`,
      );
    }
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

function listJsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listJsFiles(full));
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

if (failures > 0) {
  console.error(`\ncheck-action-bodies: พบปัญหา ${failures} จุด`);
  process.exit(1);
}
console.log(
  "check-action-bodies: ทุก action script parse ผ่านและไม่มี escape เสีย ✓",
);
