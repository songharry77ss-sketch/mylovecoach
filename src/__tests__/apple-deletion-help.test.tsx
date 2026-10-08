import { act } from 'react';
import { Linking, Modal, Platform, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { useAccountDeletion } from '@/components/auth/apple-deletion-help';
import { AppleRevocationError, AuthCancelled, deleteAccount, SessionMissing } from '@/lib/auth';

jest.mock('@/lib/auth', () => ({
  AppleRevocationError: class extends Error {},
  AuthCancelled: class extends Error {},
  SessionMissing: class extends Error {},
  deleteAccount: jest.fn(),
}));
jest.mock('@/components/ui/button', () => {
  const { createElement } = jest.requireActual('react');
  const { Text: RNText } = jest.requireActual('react-native');
  return { Button: ({ title, disabled, loading, onPress }: { title: string; disabled?: boolean; loading?: boolean; onPress?: () => void }) => createElement(RNText, { accessibilityRole: 'button', accessibilityState: { disabled: Boolean(disabled || loading) }, onPress: disabled || loading ? undefined : onPress }, title) };
});

jest.setTimeout(30_000);
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const remove = deleteAccount as jest.Mock;
const feedback = { onDeleted: jest.fn(), onCancelled: jest.fn(), onSessionMissing: jest.fn(), onError: jest.fn() };
let current: ReturnType<typeof useAccountDeletion>;
let tree: ReactTestRenderer;
let liveMemberId: string | undefined;
const memberListeners = new Set<(id: string | undefined) => void>();
function setLiveMember(id: string | undefined) {
  liveMemberId = id;
  for (const listener of memberListeners) listener(id);
}
function Probe({ memberId = 'member-test' }: { memberId?: string }) {
  setLiveMember(memberId);
  current = useAccountDeletion({ memberId, getCurrentMemberId: () => liveMemberId, subscribeToMember: (listener) => { memberListeners.add(listener); return () => { memberListeners.delete(listener); }; }, ...feedback });
  return current.sheet;
}
const view = (memberId = 'member-test') => <SafeAreaProvider initialMetrics={METRICS}><Probe memberId={memberId} /></SafeAreaProvider>;
const button = (title: string) => tree.root.findAllByType(Text).find((item) => item.props.children === title && item.props.accessibilityRole === 'button')!;
const shown = () => tree.root.findAllByType(Text).map((item) => [item.props.children].flat().join('')).join('\n');
const checkNotice = () => tree.root.findByProps({ accessibilityRole: 'checkbox' }).props.onPress();
const failAutomatic = async () => {
  remove.mockRejectedValueOnce(new AppleRevocationError('자동 연결 해제 실패', 'apple_revoke_failed'));
  await act(async () => { await current.remove(); });
};

beforeEach(async () => {
  jest.clearAllMocks();
  remove.mockReset();
  memberListeners.clear();
  await act(async () => { tree = create(view()); });
});
afterEach(() => { act(() => tree.unmount()); });

it('자동 해제 실패는 회원 삭제 성공으로 표시하지 않고 재시도·수동 안내를 보여 준다', async () => {
  await failAutomatic();
  expect(feedback.onDeleted).not.toHaveBeenCalled();
  expect(shown()).toContain('회원 정보는 아직 삭제하지 않았어요');
  expect(shown()).toContain('Apple 연결은 자동 해제되지 않으며 안내대로 직접 해제해야 해요');
  expect(button('Apple 연결 해제 다시 시도')).toBeDefined();
  expect(button('안내 확인 후 탈퇴 계속').props.accessibilityState.disabled).toBe(true);
});

it('공식 안내를 열기만 해서는 수동 삭제를 시작하거나 안내 확인을 대신하지 않는다', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'ios');
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  try {
    await failAutomatic();
    await act(async () => tree.root.findByProps({ accessibilityLabel: 'Apple 공식 연결 해제 안내' }).props.onPress());
    expect(open).toHaveBeenCalledWith('https://support.apple.com/102571');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(button('안내 확인 후 탈퇴 계속').props.accessibilityState.disabled).toBe(true);
  } finally { open.mockRestore(); platform.restore(); }
});

it('웹 공식 안내는 새 탭 링크이며 삭제 동작과 분리된다', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'web');
  try {
    await failAutomatic();
    const link = tree.root.findByProps({ accessibilityLabel: 'Apple 공식 연결 해제 안내' }).props;
    expect(link.href).toBe('https://support.apple.com/102571');
    expect(link.hrefAttrs).toEqual({ target: '_blank', rel: 'noopener noreferrer' });
    expect(link.onPress).toBeUndefined();
    expect(remove).toHaveBeenCalledTimes(1);
  } finally { platform.restore(); }
});

it('안내 확인과 별도 최종 확인을 모두 거쳐야 수동 삭제를 호출하고 완료 상태를 구분한다', async () => {
  await failAutomatic();
  act(checkNotice);
  act(() => button('안내 확인 후 탈퇴 계속').props.onPress());
  expect(remove).toHaveBeenCalledTimes(1);
  expect(shown()).toContain('회원 정보를 삭제할까요?');
  expect(shown()).toContain('스토어 구독도 취소되지 않아요');
  remove.mockResolvedValueOnce({ appleRevocation: 'manual' });
  await act(async () => button('회원 정보 삭제').props.onPress());
  expect(remove).toHaveBeenLastCalledWith({ expectedUserId: 'member-test', appleManualRevocationAcknowledged: true });
  expect(feedback.onDeleted).toHaveBeenCalledWith(expect.stringContaining('Apple 연결은 자동 해제되지 않았으니'));
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
});

it.each(['안내', '최종 확인'])('%s에서 취소하면 추가 삭제 호출 없이 닫는다', async (stage) => {
  await failAutomatic();
  if (stage === '최종 확인') {
    act(checkNotice);
    act(() => button('안내 확인 후 탈퇴 계속').props.onPress());
  }
  act(() => button('탈퇴 취소').props.onPress());
  expect(remove).toHaveBeenCalledTimes(1);
  expect(feedback.onDeleted).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
});

it('재시도는 수동 확인 옵션 없이 자동 해제를 요청한다', async () => {
  await failAutomatic();
  remove.mockResolvedValueOnce({ appleRevocation: 'revoked' });
  await act(async () => button('Apple 연결 해제 다시 시도').props.onPress());
  expect(remove).toHaveBeenLastCalledWith({ expectedUserId: 'member-test' });
  expect(feedback.onDeleted).toHaveBeenCalledWith('탈퇴하고 Apple 연결을 해제했어요.');
});

it('Apple 확인 취소와 세션 만료는 수동 삭제로 넘기지 않는다', async () => {
  remove.mockRejectedValueOnce(new AuthCancelled('cancelled'));
  await act(async () => { await current.remove(); });
  expect(feedback.onCancelled).toHaveBeenCalledTimes(1);
  remove.mockRejectedValueOnce(new SessionMissing('만료'));
  await act(async () => { await current.remove(); });
  expect(feedback.onSessionMissing).toHaveBeenCalledTimes(1);
  expect(feedback.onDeleted).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
});

it('Google·카카오 등 Apple 연결이 없는 탈퇴는 기존 완료 안내를 사용한다', async () => {
  remove.mockResolvedValueOnce({ appleRevocation: 'not_applicable' });
  await act(async () => { await current.remove(); });
  expect(feedback.onDeleted).toHaveBeenCalledWith('탈퇴했어요. 그동안 고마웠어요.');
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
});

it('삭제 중 중복 호출을 막고 다른 회원으로 바뀌면 이전 확인을 폐기한다', async () => {
  let complete!: (result: { appleRevocation: string }) => void;
  remove.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = current.remove(); await current.remove(); });
  expect(remove).toHaveBeenCalledTimes(1);
  expect(current.busy).toBe(true);
  await act(async () => { complete({ appleRevocation: 'not_applicable' }); await pending; });
  await failAutomatic();
  act(checkNotice);
  await act(async () => tree.update(view('other-member')));
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
});

it('A의 첫 확인창을 띄운 뒤 B로 바뀌면 이전 확인 콜백은 B를 삭제하지 않는다', async () => {
  const previousConfirmation = current.remove;
  // 화면 재렌더가 늦더라도 실제 스토어 값이 바뀌면 바로 차단한다.
  liveMemberId = 'other-member';
  await act(async () => { await previousConfirmation(); });
  expect(remove).not.toHaveBeenCalled();
  expect(feedback.onDeleted).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
});

it.each(['자동 실패', '성공'])('A의 요청 뒤 B로 전환하면 A의 늦은 %s 안내를 B에 적용하지 않는다', async (outcome) => {
  let complete!: () => void;
  remove.mockImplementationOnce(() => new Promise((resolve, reject) => {
    complete = () => outcome === '성공' ? resolve({ appleRevocation: 'revoked' }) : reject(new AppleRevocationError('늦은 자동 실패', 'apple_revoke_failed'));
  }));
  let pending!: Promise<void>;
  await act(async () => { pending = current.remove(); });
  expect(remove).toHaveBeenCalledWith({ expectedUserId: 'member-test' });
  await act(async () => tree.update(view('other-member')));
  await act(async () => { complete(); await pending; });
  expect(feedback.onDeleted).not.toHaveBeenCalled();
  expect(feedback.onError).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
});

it('본인의 탈퇴로 회원 상태가 비워져도 정상 완료 안내는 유지한다', async () => {
  remove.mockImplementationOnce(async () => { setLiveMember(undefined); return { appleRevocation: 'revoked' }; });
  await act(async () => { await current.remove(); });
  expect(feedback.onDeleted).toHaveBeenCalledWith('탈퇴하고 Apple 연결을 해제했어요.');
});

it('A 처리 중 B로 바뀌었다가 로그아웃해도 A의 늦은 성공 안내를 버린다', async () => {
  let complete!: () => void;
  remove.mockImplementationOnce(() => new Promise((resolve) => { complete = () => resolve({ appleRevocation: 'revoked' }); }));
  let pending!: Promise<void>;
  await act(async () => { pending = current.remove(); });
  // 화면이 그려지기 전에 두 변경이 합쳐져도 요청 동안 관찰한 계정 전환은 남는다.
  setLiveMember('other-member');
  setLiveMember(undefined);
  await act(async () => { complete(); await pending; });
  expect(feedback.onDeleted).not.toHaveBeenCalled();
  expect(memberListeners.size).toBe(0);
});
