import { act } from 'react';
import { Linking, Platform, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { AppUpdateHost } from '@/components/ui/app-update-sheet';
import { requestUpdatePrompt, resetUpdateCheckForTest, UPDATE_RETRY_MS, UPDATE_SNOOZE_MS } from '@/lib/app-update';
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
jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://api.example', apiSameOrigin: false, apiToken: '', supportEmail: '', privacyUrl: '', termsUrl: '' },
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.2' } } }));
let mockPath = '/';
jest.mock('expo-router', () => ({ usePathname: () => mockPath }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const NOW = 1_950_000_000_000;
const flush = () => new Promise<void>((resolve) => jest.requireActual('timers').setImmediate(resolve));

let server: { latest: string | null; min: string | null } = { latest: '1.0.3', min: null };
let asks = 0;
const opened: string[] = [];

function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
}
function press(tree: ReactTestRenderer, label: string) {
  const target = tree.root.findAllByType(Text).find((t) => t.props.children === label && typeof t.props.onPress === 'function');
  if (!target) throw new Error(`${label} 버튼이 없어요`);
  act(() => target.props.onPress());
}
const mounted: ReactTestRenderer[] = [];
async function mount(enabled = true): Promise<ReactTestRenderer> {
  let tree: ReactTestRenderer | null = null;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AppUpdateHost enabled={enabled} />
      </SafeAreaProvider>,
    );
    await flush();
  });
  mounted.push(tree as unknown as ReactTestRenderer);
  return tree as unknown as ReactTestRenderer;
}

function unmountAll() {
  act(() => {
    mounted.splice(0).forEach((tree) => tree.unmount());
  });
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['setImmediate', 'nextTick'] });
  Platform.OS = 'android';
  mockPath = '/';
  server = { latest: '1.0.3', min: null };
  asks = 0;
  opened.length = 0;
  resetUpdateCheckForTest();
  useAppStore.getState().resetAll();
  useAppStore.setState({ hydrated: true, appUpdate: null, updateSnooze: null, user: { name: '지훈', gender: 'male', style: [], defaultTone: 'natural', createdAt: NOW } });
  jest.spyOn(Linking, 'openURL').mockImplementation(async (url: string) => {
    opened.push(url);
    return true;
  });
  global.fetch = jest.fn(async () => {
    asks += 1;
    return { ok: true, status: 200, json: async () => server };
  }) as unknown as typeof fetch;
});
afterEach(() => {
  // 떠 있는 시트를 내려, 다음 테스트의 store 초기화가 이 화면을 다시 그리지 않게 한다
  unmountAll();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('새 버전 안내 시트', () => {
  it('스토어에 새 버전이 있으면 탭 첫 화면에서 업데이트를 권한다', async () => {
    const tree = await mount();
    expect(asks).toBe(1);
    expect(texts(tree)).toEqual(expect.arrayContaining(['새 버전이 나왔어요', '지금 버전 1.0.2', '새 버전 1.0.3', '업데이트하기', '나중에']));
  });

  it('이미 최신이면 아무것도 띄우지 않는다', async () => {
    server = { latest: '1.0.2', min: null };
    const tree = await mount();
    expect(texts(tree)).toEqual([]);
  });

  it('인트로가 끝나기 전이거나, 코칭 중인 화면·시작 화면에서는 띄우지 않는다', async () => {
    expect(texts(await mount(false))).toEqual([]);
    resetUpdateCheckForTest();
    mockPath = '/crush/abc';
    expect(texts(await mount())).toEqual([]);
    resetUpdateCheckForTest();
    mockPath = '/';
    unmountAll();
    useAppStore.setState({ user: null, appUpdate: null });
    expect(texts(await mount())).toEqual([]);
  });

  it('「나중에」를 누르면 닫히고, 그 버전은 3일 동안 다시 권하지 않는다', async () => {
    const tree = await mount();
    press(tree, '나중에');
    expect(texts(tree)).toEqual([]);
    expect(useAppStore.getState().updateSnooze).toEqual({ version: '1.0.3', until: NOW + UPDATE_SNOOZE_MS });
    // 미룬 기록이 남아 있으면 다시 켜도 띄우지 않는다
    resetUpdateCheckForTest();
    expect(texts(await mount())).toEqual([]);
    // 3일이 지나면 다시 권한다
    jest.setSystemTime(NOW + UPDATE_SNOOZE_MS + 1000);
    resetUpdateCheckForTest();
    expect(texts(await mount())).toContain('새 버전이 나왔어요');
  });

  it('미뤄 둔 뒤 더 새 버전이 나오면 바로 다시 권한다', async () => {
    useAppStore.setState({ updateSnooze: { version: '1.0.3', until: NOW + UPDATE_SNOOZE_MS } });
    server = { latest: '1.0.4', min: null };
    expect(texts(await mount())).toContain('새 버전 1.0.4');
  });

  it('「업데이트하기」는 스토어를 열고, 그대로 돌아오면 하루 뒤 다시 권한다', async () => {
    const tree = await mount();
    press(tree, '업데이트하기');
    expect(opened).toEqual(['market://details?id=app.mylovecoach.android']);
    expect(texts(tree)).toEqual([]);
    expect(useAppStore.getState().updateSnooze).toEqual({ version: '1.0.3', until: NOW + UPDATE_RETRY_MS });
  });

  it('아이폰은 App Store 앱 페이지를 연다', async () => {
    Platform.OS = 'ios';
    const tree = await mount();
    press(tree, '업데이트하기');
    expect(opened).toEqual(['itms-apps://apps.apple.com/app/id6813404855']);
  });

  it('최소 지원 버전보다 낮으면 닫을 수 없고, 어느 화면에서든 띄운다', async () => {
    server = { latest: '1.0.3', min: '1.0.3' };
    mockPath = '/crush/abc';
    const tree = await mount();
    expect(texts(tree)).toContain('업데이트가 필요해요');
    expect(texts(tree)).not.toContain('나중에');
    press(tree, '업데이트하기');
    // 스토어에 다녀와도 시트는 그대로다
    expect(texts(tree)).toContain('업데이트가 필요해요');
    expect(useAppStore.getState().updateSnooze).toBeNull();
  });

  it('서버가 요청을 「업데이트가 필요해요」로 거절하면, 미뤄 둔 안내도 그 화면에서 바로 다시 띄운다', async () => {
    mockPath = '/crush/abc';
    useAppStore.setState({ updateSnooze: { version: '1.0.3', until: NOW + UPDATE_SNOOZE_MS } });
    const tree = await mount();
    expect(texts(tree)).toEqual([]);
    await act(async () => {
      requestUpdatePrompt();
      await flush();
    });
    expect(asks).toBe(2);
    expect(texts(tree)).toContain('새 버전이 나왔어요');
    expect(useAppStore.getState().updateSnooze).toBeNull();
  });
});
