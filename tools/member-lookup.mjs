// PC 에서 실행: node tools/member-lookup.mjs <찾을 말> [--grant-days 30 --label "<표시 이름>" --apply] [--secrets <폴더>]
// 회원을 계정 이름(구글·애플·카카오 닉네임)·앱 별명(「나에 대해」 이름, 회원만 2026-11-28~ 저장)·이메일 일부로 찾는다 (읽기만).
// --grant-days N : 찾은 회원이 정확히 1명이면 그 회원의 모든 기기에 N일 무제한(팀원 무제한, 관리자 화면 team_add 와 같은 값)을 넣는다.
//                  --apply 없으면 넣을 내용만 보여 준다. 1~366일.
// 개인정보: 이메일은 앞 3글자만 보여 준다. 열쇠(~/wolha-secrets/mylovecoach-supabase.txt) 값은 출력하지 않는다.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const q = args.find((a, i) => !a.startsWith('--') && !['--grant-days', '--label', '--secrets'].includes(args[i - 1]));
if (!q) {
  console.log('사용법: node tools/member-lookup.mjs <별명·이름·이메일 일부> [--grant-days 30 --label "누구" --apply]');
  process.exit(1);
}
const days = argOf('--grant-days') ? Math.min(366, Math.floor(Number(argOf('--grant-days')))) : 0;
const apply = args.includes('--apply');
const root = argOf('--secrets') ?? process.env.MYLOVECOACH_SECRETS ?? join(homedir(), 'wolha-secrets');
const env = Object.fromEntries(
  readFileSync(join(root, 'mylovecoach-supabase.txt'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' };
async function call(method, path, body, extra = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { method, headers: { ...H, ...extra }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path.split('?')[0]} → ${r.status} ${t.slice(0, 160)}`);
  return t ? JSON.parse(t) : null;
}
const like = encodeURIComponent(`*${q}*`);

// 1) 계정 이름·이메일
const byAccount = await call('GET', `member?select=user_id,provider,nickname,email,created_at,last_login_at&or=(nickname.ilike.${like},email.ilike.${like})&order=created_at.desc&limit=20`);
// 2) 앱 별명 (회원과 이어진 기기만 저장됨)
const byApp = await call('GET', `app_user?select=device_id,name,user_id&name=ilike.${like}&user_id=not.is.null&limit=20`);
const ids = new Set(byAccount.map((m) => m.user_id));
const extraIds = [...new Set(byApp.map((a) => a.user_id).filter((id) => id && !ids.has(id)))];
const more = extraIds.length ? await call('GET', `member?select=user_id,provider,nickname,email,created_at,last_login_at&user_id=in.(${extraIds.join(',')})`) : [];
const members = [...byAccount, ...more];
console.log(`「${q}」 — 회원 ${members.length}명`);

const PROVIDER = { kakao: '카카오', google: '구글', apple: '애플' };
const found = [];
for (const m of members) {
  const devs = await call('GET', `member_device?select=device_id,last_at&user_id=eq.${m.user_id}&order=last_at.desc&limit=10`);
  const devIds = devs.map((d) => d.device_id);
  const apps = devIds.length ? await call('GET', `app_user?select=device_id,name,premium_plan,platform,app_version,last_seen_at&device_id=in.(${devIds.map((d) => `"${d}"`).join(',')})`) : [];
  const team = devIds.length ? await call('GET', `team_member?select=device_id,label,expires_at&device_id=in.(${devIds.map((d) => `"${d}"`).join(',')})`) : [];
  const appNames = [...new Set(apps.map((a) => a.name).filter(Boolean))];
  console.log(
    `- ${m.nickname ?? '(계정 이름 없음)'}${appNames.length ? ` · 앱 별명 「${appNames.join('」「')}」` : ''} · ${PROVIDER[m.provider] ?? m.provider} · 이메일 ${(m.email ?? '').slice(0, 3)}… · 가입 ${m.created_at?.slice(0, 16)} · 기기 ${devIds.length}대` +
      ` · 이용권 ${[...new Set(apps.map((a) => a.premium_plan).filter(Boolean))].join(',') || '없음'} · 무제한 ${team.length ? team.map((t) => `~${t.expires_at?.slice(0, 10) ?? '무기한'}`).join(', ') : '없음'}`,
  );
  found.push({ m, devIds });
}

if (days) {
  if (found.length !== 1) {
    console.log(`\n✗ 무제한은 회원이 정확히 1명일 때만 넣는다 (지금 ${found.length}명) — 찾을 말을 더 정확하게`);
    process.exit(1);
  }
  const { m, devIds } = found[0];
  if (!devIds.length) {
    console.log('\n✗ 이 회원과 이어진 기기가 없다');
    process.exit(1);
  }
  const label = argOf('--label') ?? `${m.nickname ?? q} · ${days}일 무제한`;
  const expires_at = new Date(Date.now() + days * 86400000).toISOString();
  console.log(`\n${apply ? '✓' : '·'} ${devIds.length}대에 ${days}일 무제한 (~${expires_at.slice(0, 16)}Z) · 표시 이름 「${label}」${apply ? '' : ' — 확인만, 넣으려면 --apply'}`);
  if (apply) await call('POST', 'team_member?on_conflict=device_id', devIds.map((device_id) => ({ device_id, label, expires_at })), { Prefer: 'resolution=merge-duplicates,return=minimal' });
}
