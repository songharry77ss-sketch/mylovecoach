/**
 * 「센딧이 기억하는 이야기」 — 채팅방에서 보내고 받는 흐름 (useCoach).
 * 기억을 실어 보내고, 새 결과의 기억만 저장한다. 비밀 상담·다른 답장 더 보기·저장된 결과 재사용·보낸 뒤 지운 기억은 건드리지 않는다.
 */
import { act } from 'react';
import { create } from 'react-test-renderer';

import { useCoach, type SendInput } from '@/hooks/use-coach';
import { setAiConsentPrompter } from '@/lib/ai-consent';
import { useAppStore } from '@/store/app-store';

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
jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://coach.test', apiSameOrigin: false, apiToken: '', supportEmail: '', privacyUrl: '', termsUrl: '' },
}));
jest.mock('@/lib/images', () => ({ encodeForModel: jest.fn(async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' })) }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), trackScreen: jest.fn(), flushAnalytics: jest.fn(), contentLoggingEnabled: () => false, currentSessionId: () => 's', BASIC_LOG_VERSION: 3 }));

type Body = { crush: { memory?: string[] }; remember?: boolean; today?: string; text?: string };
const bodies: Body[] = [];
/** 서버가 돌려줄 기억 — 테스트마다 바꾼다 */
let reply: { memory?: string[] } = {};
/** 응답을 잠시 붙잡아 두는 문 (보낸 뒤 기억을 지우는 경우) */
let gate: Promise<void> | null = null;

const fetchMock = jest.fn(async (_url: string, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? '{}') as Body;
  bodies.push(body);
  if (gate) await gate;
  const analysis = {
    summary: '좋은 분위기예요',
    temperature: 'warm',
    interestScore: 60,
    heatDelta: 4,
    insights: [],
    replies: [{ tone: 'natural', text: `답장 ${bodies.length}`, why: '' }],
    nextStep: '',
    warnings: [],
    ...reply,
  };
  return { ok: true, status: 200, json: async () => ({ analysis }) } as unknown as Response;
});

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function mountCoach(): () => ReturnType<typeof useCoach> {
  const ref: { current: ReturnType<typeof useCoach> | null } = { current: null };
  function Probe() {
    ref.current = useCoach();
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  return () => ref.current as ReturnType<typeof useCoach>;
}

const send = async (coach: () => ReturnType<typeof useCoach>, input: Omit<SendInput, 'tone'> & { tone?: SendInput['tone'] }) => {
  await act(async () => {
    await coach().send({ tone: 'natural', ...input });
  });
};

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] });
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => jest.useRealTimers());
afterEach(() => jest.clearAllTimers());

beforeEach(() => {
  bodies.length = 0;
  reply = {};
  gate = null;
  fetchMock.mockClear();
  setAiConsentPrompter(async () => true);
  useAppStore.getState().resetAll();
  useAppStore.setState({
    hydrated: true,
    user: { name: '지훈', gender: 'male', style: [], defaultTone: 'natural', createdAt: 0 },
    aiConsent: true,
    aiConsentProvider: 'google',
    aiConsentAt: 1,
    premium: { plan: 'lifetime', productId: 'test', expiresAt: null, verifiedAt: Date.now() } as never,
  });
});

const newCrush = (secret = false) =>
  useAppStore.getState().addCrush({ name: secret ? '비밀 상담' : '민지', gender: 'female', relationship: 'talking', style: [], notes: '', ...(secret ? { secret: true } : {}) }).id;

describe('센딧이 기억하는 이야기 — 채팅방 흐름', () => {
  it('첫 결과의 기억을 저장하고, 다음 요청에 그 기억과 오늘 날짜를 실어 보낸다', async () => {
    const coach = mountCoach();
    const id = newCrush();
    reply = { memory: ['민지는 성수 카페를 좋아함'] };
    await send(coach, { crushId: id, image: null, text: '주말에 뭐 하자고 할까' });
    expect(bodies[0].crush.memory).toBeUndefined();
    expect(bodies[0].remember).toBeUndefined();
    expect(bodies[0].today).toMatch(/^\d{1,2}\/\d{1,2}\(.\)$/);
    expect(useAppStore.getState().crushes[id].memory?.facts).toEqual(['민지는 성수 카페를 좋아함']);

    reply = { memory: ['민지는 성수 카페를 좋아함', '토요일 오후에 만나기로 함'] };
    await send(coach, { crushId: id, image: null, text: '토요일 괜찮대!' });
    expect(bodies[1].crush.memory).toEqual(['민지는 성수 카페를 좋아함']);
    expect(useAppStore.getState().crushes[id].memory?.facts).toEqual(['민지는 성수 카페를 좋아함', '토요일 오후에 만나기로 함']);
  });

  it('모델이 빈 기억을 돌려줘도 쌓인 기억을 지우지 않는다', async () => {
    const coach = mountCoach();
    const id = newCrush();
    useAppStore.getState().setCrushMemory(id, ['민지는 성수 카페를 좋아함']);
    reply = { memory: [] };
    await send(coach, { crushId: id, image: null, text: '안녕' });
    expect(useAppStore.getState().crushes[id].memory?.facts).toEqual(['민지는 성수 카페를 좋아함']);
  });

  it('「다른 답장 더 보기」는 기억을 싣되 고치지 않는다 (기억: 남기지 않음)', async () => {
    const coach = mountCoach();
    const id = newCrush();
    reply = { memory: ['민지는 성수 카페를 좋아함'] };
    await send(coach, { crushId: id, image: null, text: '주말에 뭐 하자고 할까' });
    const card = useAppStore.getState().messages[id].find((m) => m.analysis)!;
    reply = { memory: ['다른 답장에서 생긴 엉뚱한 기억'] };
    await send(coach, { crushId: id, image: null, text: '', variationOf: card.id });
    expect(bodies[1].remember).toBe(false);
    expect(bodies[1].crush.memory).toEqual(['민지는 성수 카페를 좋아함']);
    expect(useAppStore.getState().crushes[id].memory?.facts).toEqual(['민지는 성수 카페를 좋아함']);
  });

  it('비밀 상담은 기억을 보내지도 저장하지도 않는다', async () => {
    const coach = mountCoach();
    const id = newCrush(true);
    reply = { memory: ['비밀 얘기'] };
    await send(coach, { crushId: id, image: null, text: '전 애인한테 연락 올까?' });
    expect(bodies[0].remember).toBe(false);
    expect(bodies[0].crush.memory).toBeUndefined();
    expect(useAppStore.getState().crushes[id].memory).toBeUndefined();
  });

  it('저장된 결과를 다시 쓰면(같은 요청 반복) 그때의 기억으로 지금 기억을 되돌리지 않는다', async () => {
    const coach = mountCoach();
    const id = newCrush();
    reply = { memory: ['처음 기억'] };
    await send(coach, { crushId: id, image: null, text: '같은 질문' });
    // 사용자가 기억을 지운 뒤 같은 질문을 다시 보낸다 — 저장된 결과를 쓰고 AI 는 부르지 않는다
    useAppStore.getState().setCrushMemory(id, null);
    await send(coach, { crushId: id, image: null, text: '같은 질문' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().crushes[id].memory).toBeUndefined();
  });

  it('보낸 뒤 결과를 기다리는 사이 기억을 지웠으면 이번 결과로 되살리지 않는다', async () => {
    const coach = mountCoach();
    const id = newCrush();
    useAppStore.getState().setCrushMemory(id, ['지울 기억', '남길 기억']);
    let open: () => void = () => {};
    gate = new Promise<void>((resolve) => (open = resolve));
    reply = { memory: ['지울 기억', '남길 기억', '새 기억'] };
    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = coach().send({ crushId: id, image: null, text: '안녕', tone: 'natural' });
      for (let i = 0; i < 20 && bodies.length === 0; i += 1) await flush();
    });
    expect(bodies[0].crush.memory).toEqual(['지울 기억', '남길 기억']);
    act(() => {
      useAppStore.getState().setCrushMemory(id, ['남길 기억']);
    });
    await act(async () => {
      open();
      await pending;
    });
    expect(useAppStore.getState().crushes[id].memory?.facts).toEqual(['남길 기억']);
  });
});
