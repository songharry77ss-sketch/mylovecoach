import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { useReducedMotion } from 'react-native-reanimated';

import { INTRO_EXIT_MS, INTRO_MIN_MS, IntroSplash, SPLASH_BACKGROUND, SPLASH_LOGO_SIZE, makePieces } from '@/components/fx/intro-splash';

// 애니메이션은 기기에서 볼 것이라 여기서는 Reanimated 를 테스트용 대역으로 바꾸고 순서(언제 닫히는지)만 본다
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated/mock'), useReducedMotion: jest.fn(() => false) }));

const appJson = require('../../app.json') as { expo: { plugins: (string | [string, Record<string, unknown>])[] } };

describe('인트로 — 네이티브 스플래시와 첫 화면이 같아야 끊김이 없다', () => {
  it('배경색·로고 크기가 app.json 의 expo-splash-screen 설정과 같다', () => {
    const entry = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen') as [string, { backgroundColor: string; imageWidth: number; image: string; dark: { backgroundColor: string } }];
    expect(entry).toBeDefined();
    const config = entry[1];
    expect(config.backgroundColor.toUpperCase()).toBe(SPLASH_BACKGROUND.light.toUpperCase());
    expect(config.dark.backgroundColor.toUpperCase()).toBe(SPLASH_BACKGROUND.dark.toUpperCase());
    expect(config.imageWidth).toBe(SPLASH_LOGO_SIZE);
    expect(config.image).toBe('./assets/images/splash-icon.png');
  });

  it('최소 노출 + 사라지는 시간이 2.5초를 넘지 않는다 (탭하면 더 빨리)', () => {
    expect(INTRO_MIN_MS + INTRO_EXIT_MS).toBeLessThanOrEqual(2500);
  });

  it('터지는 조각은 매번 같은 모양으로, 로고 둘레에 고르게 퍼진다', () => {
    const a = makePieces('light');
    expect(makePieces('light')).toEqual(a);
    expect(a).toHaveLength(18);
    expect(new Set(a.map((p) => p.kind))).toEqual(new Set(['heart', 'sparkle', 'dot']));
    for (const p of a) {
      expect(p.distance).toBeGreaterThanOrEqual(85);
      expect(p.distance).toBeLessThanOrEqual(190);
      // 아래로 가는 조각은 앱 이름 자리까지 가지 않는다
      if (Math.sin(p.angle) > 0.35) expect(p.distance).toBeLessThanOrEqual(135);
      expect(p.delay + p.duration).toBeLessThan(1500);
    }
    // 왼쪽·오른쪽·위·아래 모두에 조각이 있다
    const quadrant = (p: { angle: number }) => Math.floor((((p.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 2));
    expect(new Set(a.map(quadrant)).size).toBe(4);
  });
});

describe('인트로 — 언제 닫히나', () => {
  const mounted: ReactTestRenderer[] = [];
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });
  afterEach(() => {
    act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function mount(ready: boolean) {
    const onShown = jest.fn();
    const onDone = jest.fn();
    const onBeat = jest.fn();
    let tree: ReactTestRenderer | null = null;
    act(() => {
      tree = create(<IntroSplash ready={ready} onShown={onShown} onBeat={onBeat} onDone={onDone} />);
    });
    mounted.push(tree as unknown as ReactTestRenderer);
    const rerender = (next: boolean) => act(() => (tree as unknown as ReactTestRenderer).update(<IntroSplash ready={next} onShown={onShown} onBeat={onBeat} onDone={onDone} />));
    return { tree: tree as unknown as ReactTestRenderer, onShown, onDone, onBeat, rerender };
  }
  const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

  it('로고를 그린 뒤 네이티브 스플래시를 내리고, 최소 시간이 지나면 사라진다', () => {
    // 테스트에는 이미지 로드가 없어 0.45초 대기 뒤 시작한다 (기기에서는 로고가 뜨는 즉시)
    const { onShown, onDone, onBeat } = mount(true);
    advance(500);
    expect(onShown).toHaveBeenCalledTimes(1);
    advance(300);
    expect(onBeat).toHaveBeenCalledTimes(1);
    advance(450 + INTRO_MIN_MS - 800 - 50);
    expect(onDone).not.toHaveBeenCalled();
    advance(50 + INTRO_EXIT_MS + 100);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('저장소를 다 읽기 전에는 닫지 않고, 읽으면 바로 닫는다', () => {
    const { onDone, rerender } = mount(false);
    advance(INTRO_MIN_MS + 1000);
    expect(onDone).not.toHaveBeenCalled();
    rerender(true);
    advance(INTRO_EXIT_MS + 100);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('저장소가 끝내 안 읽혀도 5초면 닫힌다', () => {
    const { onDone } = mount(false);
    advance(5000 + INTRO_EXIT_MS + 100);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('탭하면 건너뛴다 (저장소를 읽은 뒤)', () => {
    const { tree, onDone } = mount(true);
    advance(500);
    const skip = tree.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0];
    act(() => skip.props.onPress());
    advance(INTRO_EXIT_MS + 100);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('먼저 건너뛰기를 눌러도 저장소가 준비되기 전에는 닫지 않는다', () => {
    const { tree, onDone, rerender } = mount(false);
    const skip = tree.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0];
    act(() => skip.props.onPress());
    advance(600);
    expect(onDone).not.toHaveBeenCalled();
    rerender(true);
    advance(INTRO_EXIT_MS + 100);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('동작 줄이기에서는 짧게 닫히고 두근 효과를 내지 않는다', () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const { onDone, onBeat } = mount(true);
    advance(1700);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onBeat).not.toHaveBeenCalled();
  });

  it('곧바로 건너뛰면 남은 로고 시작·진동 예약을 실행하지 않는다', () => {
    const { tree, onShown, onDone, onBeat } = mount(true);
    const skip = tree.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0];
    act(() => skip.props.onPress());
    advance(1000);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onShown).not.toHaveBeenCalled();
    expect(onBeat).not.toHaveBeenCalled();
  });

  it('로그인 복귀 등으로 먼저 사라지면 예약한 콜백도 정리한다', () => {
    const { tree, onShown, onDone, onBeat } = mount(true);
    act(() => tree.unmount());
    mounted.splice(mounted.indexOf(tree), 1);
    advance(8000);
    expect(onShown).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(onBeat).not.toHaveBeenCalled();
  });
});
