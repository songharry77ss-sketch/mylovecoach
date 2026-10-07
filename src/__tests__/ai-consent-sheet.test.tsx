import { act } from 'react';
import { Modal, Platform, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { AiConsentHost } from '@/components/coach/ai-consent-sheet';
import { ensureAiConsent, type AiRoute } from '@/lib/ai-consent';
import { useAppStore } from '@/store/app-store';

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
// 버튼의 눌림 애니메이션(Reanimated)은 여기서 볼 것이 아니라 글자 버튼으로 대신한다
jest.mock('@/components/ui/button', () => {
  const { createElement } = jest.requireActual('react');
  const { Text: RNText } = jest.requireActual('react-native');
  return { Button: ({ title, onPress }: { title: string; onPress?: () => void }) => createElement(RNText, { accessibilityRole: 'button', onPress }, title) };
});

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** 화면에 보이는 글자 전부 */
function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
}
function press(tree: ReactTestRenderer, label: string) {
  const target = tree.root.findAllByType(Text).find((t) => t.props.children === label && typeof t.props.onPress === 'function');
  if (!target) throw new Error(`${label} 버튼이 없어요`);
  target.props.onPress();
}
function mount(): ReactTestRenderer {
  let tree: ReactTestRenderer | null = null;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AiConsentHost />
      </SafeAreaProvider>,
    );
  });
  return tree as unknown as ReactTestRenderer;
}
/** 동의를 요청하고 시트가 뜰 때까지 기다린다. 답은 객체로 감싸 돌려준다 (프로미스를 그대로 돌려주면 답이 날 때까지 기다려 버린다) */
async function ask(route: AiRoute): Promise<{ answer: Promise<boolean> }> {
  let answer: Promise<boolean> = Promise.resolve(false);
  await act(async () => {
    answer = ensureAiConsent(route);
    await flush();
  });
  return { answer };
}

beforeEach(() => {
  useAppStore.getState().resetAll();
  useAppStore.setState({ hydrated: true });
});

describe('AI 분석 동의 시트', () => {
  it('요청이 올 때만 뜨고, 받는 곳·보내는 내용을 알린 뒤 「동의하고 계속」을 그 요청에 돌려준다', async () => {
    const tree = mount();
    expect(texts(tree)).toEqual([]);
    const { answer } = await ask({ provider: 'google', via: 'relay' });
    const shown = texts(tree).join('\n');
    expect(shown).toContain('대화 내용을 Google AI로 보내도 될까요?');
    expect(shown).toContain('Google LLC의 Gemini API예요');
    expect(shown).toContain('국외 이전');
    expect(shown).toContain('대화 캡처 이미지');
    expect(shown).toContain('마이 → AI 분석 동의');
    expect(shown).toContain('개인정보 처리방침');
    expect(shown).toContain('동의 안 함');
    await act(async () => press(tree, '동의하고 계속'));
    await expect(answer).resolves.toBe(true);
    expect(texts(tree)).toEqual([]);
    expect(useAppStore.getState().aiConsent).toBe(true);
    act(() => tree.unmount());
  });

  it('「동의 안 함」이면 거절로 돌려주고 시트를 닫는다', async () => {
    const tree = mount();
    const { answer } = await ask({ provider: 'google', via: 'relay' });
    await act(async () => press(tree, '동의 안 함'));
    await expect(answer).resolves.toBe(false);
    expect(texts(tree)).toEqual([]);
    expect(useAppStore.getState().aiConsent).toBe(false);
    act(() => tree.unmount());
  });

  it('개인 키로 보낼 때는 그 키의 회사로 바로 간다고 알린다', async () => {
    const tree = mount();
    const { answer } = await ask({ provider: 'anthropic', via: 'direct' });
    const shown = texts(tree).join('\n');
    expect(shown).toContain('대화 내용을 Anthropic AI로 보내도 될까요?');
    expect(shown).toContain('내가 등록한 API 키의 회사(Anthropic)예요');
    expect(shown).not.toContain('Google LLC');
    await act(async () => press(tree, '동의 안 함'));
    await expect(answer).resolves.toBe(false);
    act(() => tree.unmount());
  });

  it('안드로이드·웹은 Modal 로 띄우고, 뒤로 가기는 동의 안 함으로 본다', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      const tree = mount();
      const { answer } = await ask({ provider: 'google', via: 'relay' });
      expect(texts(tree).join('\n')).toContain('대화 내용을 Google AI로 보내도 될까요?');
      await act(async () => tree.root.findByType(Modal).props.onRequestClose());
      await expect(answer).resolves.toBe(false);
      expect(tree.root.findAllByType(Modal)).toHaveLength(0);
      act(() => tree.unmount());
    } finally {
      os.restore();
    }
  });

  it('VoiceOver 닫기 제스처(두 손가락 문지르기)는 동의 안 함으로 본다', async () => {
    const tree = mount();
    const { answer } = await ask({ provider: 'google', via: 'relay' });
    const sheet = tree.root.findAll((node) => node.props.accessibilityViewIsModal === true && typeof node.props.onAccessibilityEscape === 'function')[0];
    await act(async () => sheet.props.onAccessibilityEscape());
    await expect(answer).resolves.toBe(false);
    expect(texts(tree)).toEqual([]);
    act(() => tree.unmount());
  });

  it('시트가 사라지면 기다리던 요청은 거절로 끝나 멈춰 있지 않는다', async () => {
    const tree = mount();
    const { answer } = await ask({ provider: 'google', via: 'relay' });
    act(() => tree.unmount());
    await expect(answer).resolves.toBe(false);
  });
});
