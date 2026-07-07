#!/usr/bin/env node
/**
 * Query and update Sentry issues for the kubdee-ai project from the terminal.
 *
 * Auth token is read from signing/sentry.env (gitignored — never commit it):
 *   SENTRY_AUTH_TOKEN=sntryu_...
 * Scopes needed: event:write (list + resolve), project:read, org:read.
 *
 * Usage:
 *   node scripts/sentry.mjs list [--all]        # unresolved issues (--all = any status)
 *   node scripts/sentry.mjs view <shortId|id>   # issue detail + latest event stack trace
 *   node scripts/sentry.mjs resolve <shortId|id> # mark resolved (after shipping a fix)
 *   node scripts/sentry.mjs ignore  <shortId|id> # mute
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ORG = 'ie-advidor';
const PROJECT = 'kubdee-ai';
const BASE = 'https://sentry.io/api/0';

function token() {
  const fromEnv = process.env.SENTRY_AUTH_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    const raw = readFileSync(join(repoRoot, 'signing/sentry.env'), 'utf8');
    const m = raw.match(/SENTRY_AUTH_TOKEN=(\S+)/);
    if (m) return m[1];
  } catch {
    // fall through
  }
  console.error('No SENTRY_AUTH_TOKEN. Put it in signing/sentry.env or the env.');
  process.exit(1);
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    console.error(`Sentry API ${res.status} ${res.statusText} for ${path}`);
    console.error((await res.text()).slice(0, 400));
    process.exit(1);
  }
  return res.status === 204 ? null : res.json();
}

// Resolve a short id (KUBDEE-AI-2) or numeric id to the numeric issue id.
async function resolveIssueId(ref) {
  if (/^\d+$/.test(ref)) return ref;
  const resolved = await api(`/organizations/${ORG}/shortids/${encodeURIComponent(ref.toUpperCase())}/`);
  const id = resolved.groupId ?? resolved.group?.id;
  if (!id) {
    console.error(`No issue matching "${ref}".`);
    process.exit(1);
  }
  return id;
}

async function cmdList(all) {
  const query = all ? '' : 'is:unresolved';
  const issues = await api(`/projects/${ORG}/${PROJECT}/issues/?query=${encodeURIComponent(query)}&statsPeriod=14d`);
  if (!issues.length) {
    console.log('No issues.');
    return;
  }
  console.log(`${issues.length} issue(s):\n`);
  for (const i of issues) {
    console.log(`${i.shortId}  [${i.status}]  ${i.title}`);
    console.log(`   ${i.culprit ?? ''}`);
    console.log(`   events: ${i.count}  users: ${i.userCount}  lastSeen: ${i.lastSeen}  id: ${i.id}`);
    console.log(`   ${i.permalink}\n`);
  }
}

async function cmdView(ref) {
  const id = await resolveIssueId(ref);
  const issue = await api(`/organizations/${ORG}/issues/${id}/`);
  console.log(`${issue.shortId}  [${issue.status}]  ${issue.title}`);
  console.log(`culprit: ${issue.culprit ?? ''}`);
  console.log(`events: ${issue.count}  users: ${issue.userCount}  firstSeen: ${issue.firstSeen}  lastSeen: ${issue.lastSeen}`);
  console.log(`${issue.permalink}\n`);

  const event = await api(`/organizations/${ORG}/issues/${id}/events/latest/`);
  const tags = Object.fromEntries((event.tags ?? []).map((t) => [t.key, t.value]));
  console.log('device:', tags['device'] ?? tags['device.family'] ?? '?', '| os:', tags['os'] ?? '?', '| release:', tags['release'] ?? '?', '\n');

  for (const entry of event.entries ?? []) {
    if (entry.type === 'exception') {
      for (const exc of entry.data.values ?? []) {
        console.log(`${exc.type}: ${exc.value ?? ''}`);
        const frames = exc.stacktrace?.frames ?? [];
        for (const f of frames.slice(-14)) {
          const loc = [f.filename ?? f.module, f.lineNo].filter(Boolean).join(':');
          console.log(`   at ${f.function ?? '?'} (${loc})${f.inApp ? '  <- app' : ''}`);
        }
        console.log('');
      }
    }
    if (entry.type === 'breadcrumbs') {
      const crumbs = (entry.data.values ?? []).slice(-8);
      if (crumbs.length) {
        console.log('breadcrumbs (last 8):');
        for (const c of crumbs) console.log(`   [${c.category ?? c.type}] ${c.message ?? JSON.stringify(c.data ?? {})}`);
        console.log('');
      }
    }
  }
}

async function cmdStatus(ref, status) {
  const id = await resolveIssueId(ref);
  await api(`/organizations/${ORG}/issues/${id}/`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
  console.log(`Issue ${ref} -> ${status}`);
}

const [cmd, arg] = process.argv.slice(2);
switch (cmd) {
  case 'list':
    await cmdList(arg === '--all');
    break;
  case 'view':
    if (!arg) { console.error('usage: view <shortId|id>'); process.exit(1); }
    await cmdView(arg);
    break;
  case 'resolve':
    if (!arg) { console.error('usage: resolve <shortId|id>'); process.exit(1); }
    await cmdStatus(arg, 'resolved');
    break;
  case 'ignore':
    if (!arg) { console.error('usage: ignore <shortId|id>'); process.exit(1); }
    await cmdStatus(arg, 'ignored');
    break;
  default:
    console.log('usage: node scripts/sentry.mjs <list [--all] | view <id> | resolve <id> | ignore <id>>');
    process.exit(cmd ? 1 : 0);
}
