import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { PLAY_NOTES_MAX, playRelease, playReleaseNotes } from './play-release.mjs';

test('해당 버전의 새 소식만 ko-KR 출시 노트로 만든다', () => {
  const markdown = '## 이번 버전의 새로운 기능 (1.0.4)\n\n- 동의 화면 정리\n- 개인정보 설정 추가\n\n## 이번 버전의 새로운 기능 (1.0.3)\n- 예전 판';
  assert.deepEqual(playReleaseNotes(markdown, '1.0.4'), [{ language: 'ko-KR', text: '· 동의 화면 정리\n· 개인정보 설정 추가' }]);
});

test('새 소식이 없거나 500자를 넘으면 올리지 않는다', () => {
  assert.throws(() => playReleaseNotes('## 이번 버전의 새로운 기능 (1.0.3)\n- 예전 판', '1.0.4'), /새 소식이 없어/);
  const long = `## 이번 버전의 새로운 기능 (1.0.4)\n- ${'가'.repeat(PLAY_NOTES_MAX)}`;
  assert.throws(() => playReleaseNotes(long, '1.0.4'), /500자/);
});

test('출시 이름은 versionCode (앱 버전), 노트가 있을 때만 넣는다', () => {
  assert.deepEqual(playRelease({ versionCode: 119, versionString: '1.0.4', status: 'completed', notes: [{ language: 'ko-KR', text: '· 새 기능' }] }), {
    name: '119 (1.0.4)',
    versionCodes: ['119'],
    status: 'completed',
    releaseNotes: [{ language: 'ko-KR', text: '· 새 기능' }],
  });
  assert.deepEqual(playRelease({ versionCode: 118, status: 'completed' }), { name: '118', versionCodes: ['118'], status: 'completed' });
  assert.throws(() => playRelease({ versionCode: 0, status: 'completed' }), /versionCode/);
});

test('app.json 버전의 새 소식이 문서에 있고 Play 한도 안이다', () => {
  const markdown = readFileSync(new URL('../../docs/STORE_LISTING.md', import.meta.url), 'utf8');
  const { version } = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')).expo;
  const [{ text }] = playReleaseNotes(markdown, version);
  assert.ok(text.startsWith('· '));
  assert.ok([...text].length <= PLAY_NOTES_MAX);
});
