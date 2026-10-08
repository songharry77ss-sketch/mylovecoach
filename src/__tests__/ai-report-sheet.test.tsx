import { act } from 'react';
import { Modal, Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { useAiReport, type AiReportTarget } from '@/components/coach/ai-report-sheet';
import {
  aiReportAvailable,
  coachReportContent,
  crushReportContent,
  mindReportContent,
  practiceFeedbackReportContent,
  practiceReportContent,
  sendAiReport,
} from '@/lib/ai-report';
import { latestPartnerText } from '@/lib/practice';
import type { CoachAnalysis, CrushReport, MindReading, PracticeTurn } from '@/lib/types';

// 변환 캐시가 빈 환경(새 클론·--no-cache)에서는 첫 렌더가 모달·입력칸 모듈을 처음 불러오느라 수 초 걸린다.
// 기본 5초를 넘겨 실패하고, 시간 초과된 테스트가 뒤에서 마저 보낸 요청이 다음 테스트의 호출 수까지 흔들었다
jest.setTimeout(30_000);

// 테스트 환경에는 기기 저장소 네이티브 모듈이 없어 메모리로 대신한다
jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});
// 스토어 빌드처럼 중계 서버 주소와 앱 토큰이 있는 상태
jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://coach.test', apiSameOrigin: false, apiToken: 'app-token', supportEmail: '', privacyUrl: 'https://coach.test/privacy.html', termsUrl: '' },
}));
// 버튼의 눌림 애니메이션(Reanimated)은 여기서 볼 것이 아니라 글자 버튼으로 대신한다 (비활성이면 눌리지 않음)
jest.mock('@/components/ui/button', () => {
  const { createElement } = jest.requireActual('react');
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    Button: ({ title, onPress, disabled, loading }: { title: string; onPress?: () => void; disabled?: boolean; loading?: boolean }) =>
      createElement(RNText, { accessibilityRole: 'button', accessibilityState: { disabled: Boolean(disabled || loading) }, onPress: disabled || loading ? undefined : onPress }, title),
  };
});
// 토스트는 모달 밖(루트)에 뜨므로 무엇을 띄웠는지만 본다
const mockToast = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: mockToast }) }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
let fetchReply: { ok: boolean; status: number; json: unknown } = { ok: true, status: 201, json: { ok: true } };
const fetchMock = jest.fn(
  async (_url: string, _init?: { body?: string; headers?: Record<string, string> }): Promise<FakeResponse> => ({
    ok: fetchReply.ok,
    status: fetchReply.status,
    json: async () => fetchReply.json,
  }),
);
/** 보낸 신고 본문들 (테스트마다 처음부터 센다) */
const sentBodies = () => fetchMock.mock.calls.map((c) => JSON.parse(c[1]?.body ?? '{}') as Record<string, unknown>);
/** 마지막으로 보낸 신고 본문 */
const sentBody = () => sentBodies()[sentBodies().length - 1] ?? {};

/** 화면에 보이는 글자 전부 */
function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
}
/** 그 글자를 담은 가장 안쪽의 누를 수 있는 것 (칩·버튼). 비활성이면 없음 */
function pressable(tree: ReactTestRenderer, label: string) {
  const hits = tree.root.findAll(
    (n) =>
      typeof n.props.onPress === 'function' &&
      !n.props.disabled &&
      !n.props.accessibilityState?.disabled &&
      n.findAllByType(Text).some((t) => [t.props.children].flat().join('') === label),
  );
  return hits[hits.length - 1];
}
async function press(tree: ReactTestRenderer, label: string) {
  const target = pressable(tree, label);
  if (!target) throw new Error(`${label} 를 누를 수 없어요`);
  await act(async () => {
    target.props.onPress();
    await flush();
  });
}
function typeNote(tree: ReactTestRenderer, text: string) {
  act(() => tree.root.findByType(TextInput).props.onChangeText(text));
}

/** 시트를 둔 화면을 띄우고, 신고 시트를 여는 함수를 돌려준다 */
function mount(): { tree: ReactTestRenderer; open: (t?: AiReportTarget) => void } {
  const ref: { open: (t?: AiReportTarget) => void } = { open: () => {} };
  function Screen() {
    const report = useAiReport();
    ref.open = report.open;
    return report.sheet;
  }
  let tree: ReactTestRenderer | null = null;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <Screen />
      </SafeAreaProvider>,
    );
  });
  return { tree: tree as unknown as ReactTestRenderer, open: (t) => act(() => ref.open(t)) };
}

const ANALYSIS: CoachAnalysis = {
  summary: '관심은 있어 보여요',
  temperature: 'warm',
  interestScore: 60,
  insights: [],
  replies: [
    { tone: 'natural', text: '나도 좋아!', why: '' },
    { tone: 'witty', text: '그럼 토요일에 보자 ㅋㅋ', why: '' },
  ],
  nextStep: '가볍게 약속 잡기',
  warnings: [],
};

beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
  // 시트를 한 번 미리 그려 둔다 (모달·입력칸·칩 모듈을 여기서 불러 첫 테스트의 시간 제한에 걸리지 않게). 보내지는 않는다
  const { tree, open } = mount();
  open({ mode: 'coach', content: '미리 그리기' });
  act(() => tree.unmount());
}, 60_000);
beforeEach(() => {
  fetchMock.mockClear();
  mockToast.mockClear();
  fetchReply = { ok: true, status: 201, json: { ok: true } };
});

describe('AI 답변 신고 시트', () => {
  it('사유를 골라야 「신고하기」가 눌리고, 보내면 답변·사유·메모만 간다 (기기 ID 없음)', async () => {
    const { tree, open } = mount();
    expect(texts(tree)).toEqual([]);
    const content = coachReportContent(ANALYSIS, 1);
    open({ mode: 'coach', content });
    const shown = texts(tree).join('\n');
    expect(shown).toContain('AI 답변 신고');
    expect(shown).toContain('신고할 답변');
    expect(shown).toContain('그럼 토요일에 보자 ㅋㅋ');
    expect(shown).toContain('신고하면 이 AI 답변 내용과 고른 사유가 운영자에게 전송돼 검토·필터 개선에 쓰이고 1년 뒤 지워져요');
    expect(shown).not.toContain('어느 기능의 답변인가요?');

    // 사유를 고르기 전에는 눌리지 않는다
    expect(pressable(tree, '신고하기')).toBeUndefined();
    await press(tree, '불쾌·모욕');
    typeNote(tree, '  말투가 비꼬는 느낌이에요  ');
    await press(tree, '신고하기');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://coach.test/api/report');
    expect(init?.headers?.['x-app-token']).toBe('app-token');
    const body = sentBody();
    expect(body).toMatchObject({ mode: 'coach', reason: 'offensive', note: '말투가 비꼬는 느낌이에요', content, model: 'google/relay', platform: 'ios' });
    expect(Object.keys(body).sort()).toEqual(expect.arrayContaining(['content', 'mode', 'model', 'note', 'platform', 'reason']));
    expect(JSON.stringify(body)).not.toMatch(/deviceId|device_id|sessionId/);

    // 보내면 시트가 닫히고 고맙다는 토스트
    expect(texts(tree)).toEqual([]);
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('신고했어요'), 'success');
    act(() => tree.unmount());
  });

  it('보내지 못하면 시트를 그대로 두고 서버가 준 이유를 시트 안에 보여 준다', async () => {
    fetchReply = { ok: false, status: 503, json: { error: '지금은 신고를 받을 수 없어요. 잠시 후 다시 시도해주세요.' } };
    const { tree, open } = mount();
    open({ mode: 'mind', content: '속마음: 테스트' });
    await press(tree, '위험·불법 조장');
    await press(tree, '신고하기');
    const shown = texts(tree).join('\n');
    expect(shown).toContain('지금은 신고를 받을 수 없어요. 잠시 후 다시 시도해주세요.');
    expect(shown).toContain('신고할 답변');
    expect(mockToast).not.toHaveBeenCalled();

    // 다시 누르면 다시 보낸다 (이 테스트가 보낸 속마음 신고만 센다)
    fetchReply = { ok: true, status: 201, json: { ok: true } };
    await press(tree, '신고하기');
    expect(sentBodies().filter((b) => b.mode === 'mind' && b.reason === 'dangerous')).toHaveLength(2);
    expect(texts(tree)).toEqual([]);
    act(() => tree.unmount());
  });

  it('보내는 동안에는 취소·바깥 누르기·뒤로 가기로 닫히지 않고, 결과가 나오면 닫힌다', async () => {
    let finish: (res: FakeResponse) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<FakeResponse>((resolve) => {
          finish = resolve;
        }),
    );
    const { tree, open } = mount();
    open({ mode: 'practice', content: '연습 상대 「민준」: 테스트' });
    await press(tree, '불쾌·모욕');
    await press(tree, '신고하기');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(pressable(tree, '취소')).toBeUndefined();
    const backdrop = tree.root.findAll((n) => n.props.accessibilityLabel === '닫기' && typeof n.props.onPress === 'function')[0];
    act(() => backdrop.props.onPress());
    act(() => tree.root.findByType(Modal).props.onRequestClose());
    expect(texts(tree).join('\n')).toContain('신고할 답변');

    await act(async () => {
      finish({ ok: true, status: 201, json: async () => ({ ok: true }) });
      await flush();
    });
    expect(texts(tree)).toEqual([]);
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('신고했어요'), 'success');

    // 다시 열면 바로 닫을 수 있다 (보내는 중 표시가 남지 않음)
    open({ mode: 'practice', content: '연습 상대 「민준」: 두 번째' });
    act(() => tree.root.findByType(Modal).props.onRequestClose());
    expect(texts(tree)).toEqual([]);
    act(() => tree.unmount());
  });

  it('속마음 풀이는 물어본 상황 글도 함께 간다고 알리고, 긴 내용도 잘리지 않게 다 보여 준다', () => {
    const { tree, open } = mount();
    const content = `상황: 읽고 답이 없어요\n${'속마음 '.repeat(300)}끝`;
    open({ mode: 'mind', content });
    const shown = texts(tree).join('\n');
    expect(shown).toContain('신고하면 이 풀이와 물어본 상황 글, 고른 사유가 운영자에게 전송돼');
    expect(shown).toContain(content);
    act(() => tree.unmount());
  });

  it('네트워크가 끊겨도 시트에 안내가 남는다', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const { tree, open } = mount();
    open({ mode: 'report', content: '한 줄 요약: 테스트' });
    await press(tree, '기타');
    await press(tree, '신고하기');
    expect(texts(tree).join('\n')).toContain('네트워크 연결을 확인하고 다시 신고해 주세요.');
    act(() => tree.unmount());
  });

  it('비밀 상담에서 열면 신고하면 저장된다는 경고를 먼저 보여 준다', () => {
    const { tree, open } = mount();
    open({ mode: 'coach', content: '요약: 비밀 상담 답변', secret: true });
    expect(texts(tree).join('\n')).toContain('🕶️ 비밀 상담 중이에요. 신고하면 이 답변은 저장돼요.');
    act(() => tree.unmount());
  });

  it('마이 탭(답변 없음)은 기능을 고르고 무엇이 문제였는지 적어야 보낼 수 있다', async () => {
    const { tree, open } = mount();
    open();
    const shown = texts(tree).join('\n');
    expect(shown).toContain('어느 기능의 답변인가요?');
    expect(shown).not.toContain('신고할 답변');
    expect(shown).toContain('신고하면 적은 내용과 고른 사유가 운영자에게 전송돼');
    await press(tree, '연애 연습');
    await press(tree, '성적·부적절');
    expect(pressable(tree, '신고하기')).toBeUndefined();
    typeNote(tree, '연습 상대가 성적인 농담을 했어요');
    await press(tree, '신고하기');
    const body = sentBody();
    expect(body).toMatchObject({ mode: 'practice', reason: 'sexual', note: '연습 상대가 성적인 농담을 했어요' });
    expect(body.content).toBeUndefined();
    act(() => tree.unmount());
  });
});

describe('신고할 내용 만들기', () => {
  it('코칭은 카드에 보이는 AI 글 — 요약, 지금 보고 있는 답장과 예상 반응·고른 이유, 읽어낸 포인트·다음 스텝·주의할 점', () => {
    expect(coachReportContent(ANALYSIS, 0)).toBe('요약: 관심은 있어 보여요\n답장 1: 나도 좋아!\n다음 스텝: 가볍게 약속 잡기');
    const full: CoachAnalysis = {
      ...ANALYSIS,
      insights: ['답장이 빨라요', '질문을 먼저 해요'],
      replies: [
        { tone: 'natural', text: '나도 좋아!', why: '같은 온도로 받아 줘요', expectedReaction: '진짜? 그럼 언제 볼까' },
        { tone: 'witty', text: '그럼 토요일에 보자 ㅋㅋ', why: '' },
      ],
      warnings: ['너무 길게 쓰지 않기'],
    };
    expect(coachReportContent(full, 0)).toBe(
      [
        '요약: 관심은 있어 보여요',
        '답장 1: 나도 좋아!',
        '예상 반응: 진짜? 그럼 언제 볼까',
        '고른 이유: 같은 온도로 받아 줘요',
        '읽어낸 포인트: 답장이 빨라요',
        '읽어낸 포인트: 질문을 먼저 해요',
        '다음 스텝: 가볍게 약속 잡기',
        '주의할 점: 너무 길게 쓰지 않기',
      ].join('\n'),
    );
    // 보고 있지 않은 다른 버전의 예상 반응·이유는 넣지 않는다
    expect(coachReportContent(full, 1)).toContain('답장 2: 그럼 토요일에 보자 ㅋㅋ');
    expect(coachReportContent(full, 1)).not.toContain('진짜? 그럼 언제 볼까');
    // 답장이 없는 카드에는 요약과 다음 스텝만 보인다
    expect(coachReportContent({ ...full, replies: [] }, 0)).toBe('요약: 관심은 있어 보여요\n다음 스텝: 가볍게 약속 잡기');
    expect(coachReportContent({ ...full, summary: '가'.repeat(5000) }, 0)).toHaveLength(4000);
  });

  it('보고서·속마음·연습은 화면에 보이는 내용을 담고 4000자로 자른다', () => {
    const report: CrushReport = {
      headline: '천천히 데워지는 신중한 다정파',
      keywords: ['신중함'],
      personality: '조심스러워요',
      textingStyle: '답장이 길어요',
      greenFlags: ['먼저 질문해요'],
      redFlags: [],
      interests: [],
      strategy: ['구체적으로 제안하기'],
      roadmap: [{ title: '1단계', action: '카페 가기' }],
      innerThought: '',
      compatibility: 72,
      compatibilityNote: '리듬이 잘 맞아요',
    };
    const text = crushReportContent(report);
    expect(text).toContain('한 줄 요약: 천천히 데워지는 신중한 다정파');
    expect(text).toContain('공략법 1: 구체적으로 제안하기');
    expect(text).not.toContain('주의할 신호');
    expect(crushReportContent({ ...report, personality: '가'.repeat(5000) })).toHaveLength(4000);

    const mind: MindReading = { headline: '바빴을 가능성이 커요', innerVoice: '답장해야 하는데', possibilities: [{ label: '진짜 바빴음', percent: 100, reason: '평일 낮' }], advice: '기다려 보세요', sampleReply: '' };
    expect(mindReportContent('읽고 답이 없어요', mind)).toBe('상황: 읽고 답이 없어요\n속마음: 답장해야 하는데\n결론: 바빴을 가능성이 커요\n진짜 바빴음 100%: 평일 낮\n이렇게 해보세요: 기다려 보세요');
    expect(practiceReportContent('민준', '그건 좀 아니지')).toBe('연습 상대 「민준」: 그건 좀 아니지');
  });

  it('연습 화면: 위 깃발은 상대역의 가장 최근 말풍선 묶음, 코치 피드백은 피드백과 더 좋은 메시지만', () => {
    const turn = (role: PracticeTurn['role'], text: string, extra: Partial<PracticeTurn> = {}): PracticeTurn => ({ id: text, role, text, at: 0, ...extra });
    expect(latestPartnerText([])).toBe('');
    expect(latestPartnerText([turn('me', '안녕')])).toBe('');
    expect(latestPartnerText([turn('them', '뭐해?'), turn('me', '쉬어'), turn('them', '나도 ㅋㅋ'), turn('them', '주말에 뭐 해?')])).toBe('나도 ㅋㅋ\n주말에 뭐 해?');
    expect(latestPartnerText([turn('them', '뭐해?'), turn('me', '쉬어')])).toBe('뭐해?');

    expect(practiceFeedbackReportContent({ feedback: '질문으로 이어 가서 좋아요', better: '나도 쉬는 중! 주말엔 뭐 해?' })).toBe(
      '코치 피드백: 질문으로 이어 가서 좋아요\n더 좋은 메시지: 나도 쉬는 중! 주말엔 뭐 해?',
    );
    expect(practiceFeedbackReportContent({ feedback: '좋아요', better: undefined })).toBe('코치 피드백: 좋아요');
    expect(practiceFeedbackReportContent({ feedback: '가'.repeat(5000) })).toHaveLength(4000);
  });

  it('데모 빌드에서는 신고 진입점을 숨긴다 (보낼 서버가 없음)', () => {
    const before = process.env.EXPO_PUBLIC_DEMO_MODE;
    process.env.EXPO_PUBLIC_DEMO_MODE = '1';
    try {
      jest.isolateModules(() => {
        expect(jest.requireActual<typeof import('@/lib/ai-report')>('@/lib/ai-report').aiReportAvailable).toBe(false);
      });
    } finally {
      if (before === undefined) delete process.env.EXPO_PUBLIC_DEMO_MODE;
      else process.env.EXPO_PUBLIC_DEMO_MODE = before;
    }
    expect(aiReportAvailable).toBe(true);
  });
});

describe('신고 보내기 (sendAiReport)', () => {
  it('서버가 15초 안에 답하지 않으면 요청을 끊고 네트워크 안내로 실패한다', async () => {
    jest.useFakeTimers();
    try {
      let aborted = false;
      fetchMock.mockImplementationOnce(
        (_url, init) =>
          new Promise<FakeResponse>((_resolve, reject) => {
            (init as unknown as { signal?: AbortSignal } | undefined)?.signal?.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('aborted'));
            });
          }),
      );
      let settled = false;
      const sending = sendAiReport({ mode: 'coach', reason: 'other', content: '요약: 테스트' }).finally(() => {
        settled = true;
      });
      sending.catch(() => {});
      await jest.advanceTimersByTimeAsync(14_999);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(aborted).toBe(true);
      await expect(sending).rejects.toThrow('네트워크 연결을 확인하고 다시 신고해 주세요.');
    } finally {
      jest.useRealTimers();
    }
  });

  it('앱 토큰이 맞지 않아 본문 없는 401 이 와도 상태 코드를 담아 안내한다', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    });
    await expect(sendAiReport({ mode: 'mind', reason: 'other', content: '속마음: 테스트' })).rejects.toThrow('신고를 보내지 못했어요 (401). 잠시 후 다시 시도해주세요.');
  });
});
