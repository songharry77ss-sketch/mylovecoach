// PC 에서 실행: node tools/asc-testflight.mjs [--emails a@b.com,c@d.com] [--group "테스터"] [--secrets <폴더>]
// TestFlight 외부 테스트 그룹을 만들고 테스터 이메일을 등록한다.
// 이메일을 안 주면 wolha-secrets/mylovecoach-testers.txt (한 줄에 하나 또는 쉼표 구분) 를 읽는다.
// 초대 메일은 그룹에 빌드가 들어간 뒤에 발송된다.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createAscClient, secretsRoot, step } from './lib/asc-api.mjs';

const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const root = secretsRoot(args);
const { api, getAll, findApp } = createAscClient(root);

const GROUP = argOf('--group', '테스터');
const FEEDBACK_EMAIL = argOf('--feedback-email', 'songharry77ss@gmail.com');

function readEmails() {
  const inline = argOf('--emails');
  const file = join(root, 'mylovecoach-testers.txt');
  const raw = inline ?? (existsSync(file) ? readFileSync(file, 'utf8') : '');
  return [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().replace(/^﻿/, '')).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
}

/** 기존 앱의 심사 연락처를 찾아 재사용한다 */
async function findContact(selfId) {
  const apps = await getAll('/v1/apps?limit=50');
  for (const o of apps.filter((x) => x.id !== selfId)) {
    const detail = await api('GET', `/v1/apps/${o.id}/betaAppReviewDetail`).catch(() => null);
    const a = detail?.data?.attributes;
    if (a?.contactEmail && a?.contactPhone) return { contactFirstName: a.contactFirstName, contactLastName: a.contactLastName, contactPhone: a.contactPhone, contactEmail: a.contactEmail };
    const vs = await getAll(`/v1/apps/${o.id}/appStoreVersions?limit=3`).catch(() => []);
    for (const v of vs) {
      const d = await api('GET', `/v1/appStoreVersions/${v.id}/appStoreReviewDetail`).catch(() => null);
      const b = d?.data?.attributes;
      if (b?.contactEmail && b?.contactPhone) return { contactFirstName: b.contactFirstName, contactLastName: b.contactLastName, contactPhone: b.contactPhone, contactEmail: b.contactEmail };
    }
  }
  return {};
}

async function main() {
  const app = await findApp();
  if (!app) {
    console.log('App Store Connect 에 앱이 없습니다. 먼저 앱을 만들어주세요.');
    process.exitCode = 2;
    return;
  }
  const emails = readEmails();
  if (!emails.length) {
    console.log(`테스터 이메일이 없습니다. --emails 로 주거나 ${join(root, 'mylovecoach-testers.txt')} 에 적어주세요.`);
    process.exitCode = 2;
    return;
  }
  console.log(`앱: ${app.attributes.name} · 테스터 ${emails.length}명`);

  // TestFlight 외부 테스트에 필요한 정보 (베타 앱 설명·피드백 이메일)
  await step('베타 앱 정보 (설명·피드백 이메일)', async () => {
    const locs = await getAll(`/v1/apps/${app.id}/betaAppLocalizations`);
    const attrs = {
      description: '대화 캡처를 올리면 상대에게 맞는 답장 3개와 호감 온도를 알려주는 AI 연애 코치입니다. 캡처를 올리거나 상황을 글로 적어 코칭을 받아보고, 답장이 자연스러운지 알려주세요.',
      feedbackEmail: FEEDBACK_EMAIL,
      privacyPolicyUrl: 'https://mylovecoach.vercel.app/privacy.html',
    };
    const ko = locs.find((l) => l.attributes.locale === 'ko');
    if (ko) await api('PATCH', `/v1/betaAppLocalizations/${ko.id}`, { data: { type: 'betaAppLocalizations', id: ko.id, attributes: attrs } });
    else
      await api('POST', '/v1/betaAppLocalizations', {
        data: { type: 'betaAppLocalizations', attributes: { locale: 'ko', ...attrs }, relationships: { app: { data: { type: 'apps', id: app.id } } } },
      });
    return FEEDBACK_EMAIL;
  });

  await step('베타 심사 정보', async () => {
    const cur = await api('GET', `/v1/apps/${app.id}/betaAppReviewDetail`).catch(() => null);
    // 연락처는 같은 개발자 계정의 기존 앱에서 가져온다 (Apple 이 필수로 요구)
    const contact = await findContact(app.id);
    const attrs = {
      ...contact,
      demoAccountRequired: false,
      notes: '계정 생성·로그인이 없습니다. 첫 화면에서 대화 캡처(갤러리의 아무 채팅 스크린샷)를 올리면 바로 코칭 결과가 나옵니다. 무료 3회 + 이후 하루 1회이며, 그 뒤에는 인앱 구매 화면이 열립니다.',
    };
    if (cur?.data) await api('PATCH', `/v1/betaAppReviewDetails/${cur.data.id}`, { data: { type: 'betaAppReviewDetails', id: cur.data.id, attributes: attrs } });
    else
      await api('POST', '/v1/betaAppReviewDetails', {
        data: { type: 'betaAppReviewDetails', attributes: attrs, relationships: { app: { data: { type: 'apps', id: app.id } } } },
      });
    return '';
  });

  let group;
  await step(`외부 테스트 그룹 「${GROUP}」`, async () => {
    const groups = await getAll(`/v1/apps/${app.id}/betaGroups?limit=100`);
    group = groups.find((g) => g.attributes.name === GROUP);
    if (!group)
      group = (
        await api('POST', '/v1/betaGroups', {
          data: {
            type: 'betaGroups',
            attributes: { name: GROUP, publicLinkEnabled: false, isInternalGroup: false },
            relationships: { app: { data: { type: 'apps', id: app.id } } },
          },
        })
      ).data;
    return group.attributes.isInternalGroup ? '내부 그룹' : '외부 그룹';
  });
  if (!group) return;

  await step('테스터 등록', async () => {
    const existing = await getAll(`/v1/betaGroups/${group.id}/betaTesters?limit=200`);
    const have = new Set(existing.map((t) => (t.attributes.email ?? '').toLowerCase()));
    const added = [];
    const failed = [];
    for (const email of emails) {
      if (have.has(email.toLowerCase())) continue;
      try {
        await api('POST', '/v1/betaTesters', {
          data: {
            type: 'betaTesters',
            attributes: { email },
            relationships: { betaGroups: { data: [{ type: 'betaGroups', id: group.id }] } },
          },
        });
        added.push(email);
      } catch (e) {
        // 이미 다른 앱에 등록된 테스터는 기존 계정을 그룹에 연결한다
        const found = await getAll(`/v1/betaTesters?filter[email]=${encodeURIComponent(email)}&limit=1`).catch(() => []);
        if (found[0]) {
          const ok = await api('POST', `/v1/betaGroups/${group.id}/relationships/betaTesters`, { data: [{ type: 'betaTesters', id: found[0].id }] })
            .then(() => true)
            .catch(() => false);
          if (ok) added.push(`${email} (기존)`);
          else failed.push(`${email}: ${e.message.slice(0, 60)}`);
        } else failed.push(`${email}: ${e.message.slice(0, 60)}`);
      }
    }
    if (failed.length) console.log(`  · 실패: ${failed.join(' | ')}`);
    return `새로 ${added.length}명 · 기존 ${have.size}명`;
  });

  const builds = await getAll(`/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=5`);
  console.log(`\n빌드: ${builds.map((b) => `${b.attributes.version}(${b.attributes.processingState})`).join(', ') || '없음 — TestFlight 빌드가 올라가면 테스터에게 초대 메일이 갑니다.'}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
