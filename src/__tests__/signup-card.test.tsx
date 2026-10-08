import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { Linking, Platform } from 'react-native';

import { SignupCard } from '@/components/auth/signup-card';
import { AuthCancelled, signInWithGoogle, type LinkResult } from '@/lib/auth';
import { APP_CONFIG } from '@/lib/config';

jest.mock('@/lib/auth', () => ({
  AuthCancelled: class extends Error {},
  appleSignInAvailable: jest.fn(async () => false),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
  signInWithKakao: jest.fn(),
}));
jest.mock('@/lib/haptics', () => ({ haptic: { tap: jest.fn() } }));
jest.mock('expo-font', () => ({ useFonts: () => [true, null], isLoaded: () => true, loadAsync: jest.fn() }));

jest.setTimeout(30_000);
const google = signInWithGoogle as jest.Mock;
const linked: LinkResult = { bonus: true, member: { userId: 'google-user', provider: 'google', nickname: '테스트 회원', joinedAt: 1 } };
const onDone = jest.fn();
let tree: ReactTestRenderer;

beforeEach(async () => {
  jest.clearAllMocks();
  google.mockResolvedValue(linked);
  await act(async () => {
    tree = create(<SignupCard onDone={onDone} />);
  });
});

afterEach(async () => {
  await act(async () => tree.unmount());
});

it('Google 버튼이 Google 로그인 결과를 가입 완료 처리로 전달한다', async () => {
  await act(async () => tree.root.findByProps({ accessibilityLabel: 'Google로 계속하기' }).props.onPress());
  expect(google).toHaveBeenCalledTimes(1);
  expect(onDone).toHaveBeenCalledWith(linked);
});

it('Google 로그인을 기다리는 동안 다른 로그인 버튼도 막는다', async () => {
  let complete!: (value: LinkResult) => void;
  google.mockImplementationOnce(() => new Promise<LinkResult>((resolve) => { complete = resolve; }));
  let signingIn!: Promise<void>;
  await act(async () => {
    signingIn = tree.root.findByProps({ accessibilityLabel: 'Google로 계속하기' }).props.onPress();
  });
  expect(tree.root.findByProps({ accessibilityLabel: 'Google로 계속하기' }).props.disabled).toBe(true);
  expect(tree.root.findByProps({ accessibilityLabel: '카카오로 시작하기' }).props.disabled).toBe(true);
  await act(async () => {
    complete(linked);
    await signingIn;
  });
  expect(tree.root.findByProps({ accessibilityLabel: 'Google로 계속하기' }).props.disabled).toBe(false);
});

it('Google 로그인을 취소하면 오류나 가입 완료를 표시하지 않는다', async () => {
  google.mockRejectedValueOnce(new AuthCancelled('cancelled'));
  await act(async () => tree.root.findByProps({ accessibilityLabel: 'Google로 계속하기' }).props.onPress());
  expect(onDone).not.toHaveBeenCalled();
  expect(tree.root.findAllByProps({ accessibilityLiveRegion: 'polite' })).toHaveLength(0);
});

it('가입 전에 약관과 개인정보 처리방침을 열어도 로그인은 시작하지 않는다', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await act(async () => tree.root.findByProps({ accessibilityLabel: '이용약관 보기' }).props.onPress());
  await act(async () => tree.root.findByProps({ accessibilityLabel: '개인정보 처리방침 보기' }).props.onPress());
  expect(open.mock.calls.map(([url]) => url)).toEqual([APP_CONFIG.termsUrl, APP_CONFIG.privacyUrl]);
  expect(google).not.toHaveBeenCalled();
  expect(onDone).not.toHaveBeenCalled();
  open.mockRestore();
});

it('웹 약관은 키보드와 새 탭 메뉴로 열 수 있는 실제 링크다', async () => {
  const previous = Platform.OS;
  try {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    await act(async () => tree.update(<SignupCard onDone={onDone} />));
    for (const [label, url] of [['이용약관 보기', APP_CONFIG.termsUrl], ['개인정보 처리방침 보기', APP_CONFIG.privacyUrl]]) {
      const props = tree.root.findByProps({ accessibilityLabel: label }).props;
      expect(props.href).toBe(url);
      expect(props.hrefAttrs).toEqual({ target: '_blank', rel: 'noopener noreferrer' });
      expect(props.onPress).toBeUndefined();
    }
    expect(google).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: previous });
  }
});
