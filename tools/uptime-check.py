"""서비스 감시 (uptime.yml) — 센딧 운영 서버가 멈추면 알린다.

11-20 오후 Vercel 지출 예산 100% 로 팀 프로젝트가 통째로 일시 정지(DEPLOYMENT_PAUSED)됐는데
이틀 가까이 아무도 몰랐다. Vercel 이 멈추면 Vercel 안의 알림(텔레그램 일일 보고 cron)도 같이 멈추므로
바깥(GitHub Actions)에서 확인한다.

- 매번(10분마다): 웹(200), 앱 버전 API(앱 토큰, 200), 실제 코칭 1번 — 지금 앱과 같은 3사 동의(google,anthropic,openai)로 보내
  Claude → GPT → Gemini 중 누가 답했는지 남긴다 (기기 번호 없이 보내 코칭 기록·통계에 남지 않음, 1회 약 1원)
- 매시 첫 회차: Google 에만 동의한 예전 앱 경로(Gemini)도 코칭 1번
- 문제가 있으면 텔레그램으로 알리고(비밀값이 있을 때) 작업을 실패로 끝낸다 → GitHub 실패 메일도 간다
- 멈춰 있는 동안은 회차마다(10분마다) 계속 알리고, 풀리면 「복구」를 알린다 (2026-11-26 사용자 요청)
- AI 회사 하나가 실패하고 다른 회사가 대신 답한 경우는 코치 서버가 바로 따로 알린다 (api/coach.ts)

출력에 토큰·응답 본문 전체를 찍지 않는다.
"""

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get('API_URL') or 'https://mylovecoach.vercel.app'
APP_TOKEN = os.environ.get('APP_TOKEN', '')
UA = 'sendit-uptime'


def call(path, method='GET', body=None, headers=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    h = {'user-agent': UA, **(headers or {})}
    if data is not None:
        h['content-type'] = 'application/json'
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.headers, r.read(), time.time() - started
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read(), time.time() - started
    except Exception as e:  # 연결 자체가 안 됨
        return 0, {}, str(e).encode(), time.time() - started


def previous_conclusion():
    """이 작업의 바로 앞 회차 결과 (success/failure/None)"""
    try:
        out = subprocess.run(
            ['gh', 'run', 'list', '--workflow', 'uptime.yml', '--limit', '5', '--json', 'conclusion,status,databaseId'],
            capture_output=True, text=True, check=True,
        ).stdout
        me = os.environ.get('GITHUB_RUN_ID')
        for run in json.loads(out):
            if str(run.get('databaseId')) == me or run.get('status') != 'completed':
                continue
            return run.get('conclusion')
    except Exception:
        return None
    return None


def telegram(text):
    token, chat = os.environ.get('TG_TOKEN'), os.environ.get('TG_CHAT')
    if not token or not chat:
        print('텔레그램 비밀값이 없어 메시지는 건너뜀 (작업 실패 메일만)')
        return
    req = urllib.request.Request(
        f'https://api.telegram.org/bot{token}/sendMessage',
        data=json.dumps({'chat_id': chat, 'text': text, 'disable_web_page_preview': True}).encode(),
        headers={'content-type': 'application/json'},
    )
    try:
        urllib.request.urlopen(req, timeout=20).read()
        print('텔레그램 알림 보냄')
    except Exception as e:
        print('텔레그램 알림 실패:', type(e).__name__)


def main():
    problems = []

    status, headers, body, _ = call('/')
    if status != 200:
        why = headers.get('x-vercel-error') if hasattr(headers, 'get') else None
        problems.append(f'웹 {status}' + (f' ({why})' if why else ''))

    status, headers, body, _ = call('/api/version?platform=android', headers={'x-app-token': APP_TOKEN} if APP_TOKEN else {})
    if status != 200:
        why = headers.get('x-vercel-error') if hasattr(headers, 'get') else None
        problems.append(f'버전 API {status}' + (f' ({why})' if why else ''))

    prev = previous_conclusion()
    # 매시 첫 회차(:03)에는 예전 앱 경로(Gemini)도 확인 — 예약 실행이 몇 분 밀려도 잡히게 15분까지
    hourly = time.gmtime().tm_min < 15
    if APP_TOKEN:
        req = {
            'crush': {'name': '점검', 'gender': 'female', 'relationship': 'talking', 'style': [], 'notes': ''},
            'user': {'name': '감시', 'gender': 'male', 'style': []},
            'tone': 'natural',
            'text': '어제 영화 재밌었다고 톡이 왔어. 뭐라고 답하지?',
            'remember': False,
        }
        paths = [('AI 코칭', 'google,anthropic,openai')]
        if hourly or os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch':
            paths.append(('예전 앱 AI 코칭(Gemini)', 'google'))
        for label, consent in paths:
            status, _, body, sec = call('/api/coach', 'POST', req, {'x-app-token': APP_TOKEN, 'x-ai-consent': consent}, timeout=90)
            replies = 0
            provider = ''
            try:
                data = json.loads(body)
                replies = len((data.get('analysis') or {}).get('replies') or [])
                provider = str(data.get('provider') or '')
            except Exception:
                pass
            if status != 200 or replies == 0:
                try:
                    err = str(json.loads(body).get('error') or '')[:80]
                except Exception:
                    err = ''
                problems.append(f'{label} {status}' + (f' · {err}' if err else ''))
            else:
                print(f'{label} 정상 ({sec:.1f}초, 답장 {replies}개, 답한 AI {provider or "?"})')

        # 영어판(My Love Coach, 2026-11-27~) — 설명은 영어, 답장은 대화 언어(여기선 영어)로 오는지. 한글이 섞이면 문제로 본다
        if hourly or os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch':
            en = {
                'crush': {'name': 'Emma', 'gender': 'female', 'relationship': 'talking', 'style': [], 'notes': ''},
                'user': {'name': '', 'gender': 'male', 'style': []},
                'tone': 'natural',
                'text': "Me: are you free this friday? there's a new rooftop bar i wanna try\nEmma: haha maybe 👀\nEmma: depends who's asking",
                'remember': False,
                'lang': 'en',
            }
            status, _, body, sec = call('/api/coach', 'POST', en, {'x-app-token': APP_TOKEN, 'x-ai-consent': 'anthropic,openai,google', 'x-app-lang': 'en'}, timeout=90)
            analysis = {}
            try:
                analysis = json.loads(body).get('analysis') or {}
            except Exception:
                pass
            replies = analysis.get('replies') or []
            hangul = any('가' <= ch <= '힣' for ch in json.dumps(analysis, ensure_ascii=False))
            if status != 200 or not replies or hangul:
                problems.append(f'영어판 AI 코칭 {status}' + (' · 한글 섞임' if hangul else '') + ('' if replies else ' · 답장 없음'))
            else:
                print(f'영어판 AI 코칭 정상 ({sec:.1f}초, 답장 {len(replies)}개)')
                print(f'  요약: {str(analysis.get("summary") or "")[:160]}')
                for r in replies[:3]:
                    print(f'  - {str(r.get("text") or "")[:120]}')

    now = time.strftime('%m-%d %H:%M', time.gmtime(time.time() + 9 * 3600))
    if problems:
        print('문제:', ' / '.join(problems))
        # 멈춰 있는 동안 회차마다(10분마다) 계속 알린다
        again = ' (계속 멈춰 있음)' if prev == 'failure' else ''
        telegram(f'🚨 센딧 서비스 이상{again} ({now} KST)\n' + '\n'.join('- ' + p for p in problems)
                 + '\n\nDEPLOYMENT_PAUSED 면 Vercel 지출 예산 확인 → 프로젝트 정지 풀기'
                 + '\n크레딧 소진이면 AI 회사(Anthropic·OpenAI·Google AI Studio) 충전')
        sys.exit(1)
    print('정상')
    if prev == 'failure':
        telegram(f'✅ 센딧 서비스 복구됨 ({now} KST)')


if __name__ == '__main__':
    main()
