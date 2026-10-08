import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { SignupCard } from '@/components/auth/signup-card';
import { AuthCancelled, signInWithGoogle, type LinkResult } from '@/lib/auth';

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
