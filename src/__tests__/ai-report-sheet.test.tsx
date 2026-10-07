import { act } from 'react';
import { Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { useAiReport, type AiReportTarget } from '@/components/coach/ai-report-sheet';
import { aiReportAvailable, coachReportContent, crushReportContent, mindReportContent, practiceReportContent } from '@/lib/ai-report';
import type { CoachAnalysis, CrushReport, MindReading } from '@/lib/types';

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

let fetchReply: { ok: boolean; status: number; json: unknown } = { ok: true, status: 201, json: { ok: true } };
const fetchMock = jest.fn(async (_url: string, _init?: { body?: string; headers?: Record<string, string> }) => ({
  ok: fetchReply.ok,
  status: fetchReply.status,
  json: async () => fetchReply.json,
}));
const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1]?.body ?? '{}') as Record<string, unknown>;

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
});
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

    // 다시 누르면 다시 보낸다
    fetchReply = { ok: true, status: 201, json: { ok: true } };
    await press(tree, '신고하기');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(texts(tree)).toEqual([]);
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
  it('코칭은 요약과 지금 보고 있는 답장', () => {
    expect(coachReportContent(ANALYSIS, 0)).toBe('요약: 관심은 있어 보여요\n답장 1: 나도 좋아!');
    expect(coachReportContent({ ...ANALYSIS, replies: [] }, 0)).toBe('요약: 관심은 있어 보여요\n다음 스텝: 가볍게 약속 잡기');
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
