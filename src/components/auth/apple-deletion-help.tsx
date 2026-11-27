import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AppleRevocationError, AuthCancelled, deleteAccount, SessionMissing } from '@/lib/auth';
import { subscriptionStoreName } from '@/lib/billing/plans';
import { L, LANG } from '@/lib/i18n';

const APPLE_HELP_URL = 'https://support.apple.com/102571';
const MANUAL_NOTICE = L(
  'Apple 연결은 자동 해제되지 않으며 안내대로 직접 해제해야 해요.',
  "Your Apple connection won't be removed automatically — you'll need to remove it yourself using the steps below.",
);

interface DeletionFeedback {
  memberId?: string;
  getCurrentMemberId: () => string | undefined;
  subscribeToMember: (listener: (id: string | undefined) => void) => () => void;
  onDeleted: (message: string) => void;
  onCancelled: () => void;
  onSessionMissing: () => void;
  onError: (message: string) => void;
}

/** 마이 화면의 첫 탈퇴 확인 이후 흐름. 수동 경로는 안내 확인과 별도 최종 확인을 모두 거친다. */
export function useAccountDeletion({ memberId, getCurrentMemberId, subscribeToMember, onDeleted, onCancelled, onSessionMissing, onError }: DeletionFeedback) {
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const lastMember = useRef(memberId);
  const identityRevision = useRef(0);

  // 다른 회원으로 바뀌면 이전 회원에게 받은 안내 확인을 재사용하지 않는다.
  useEffect(() => {
    if (memberId && memberId !== lastMember.current) identityRevision.current += 1;
    lastMember.current = memberId;
    setShowHelp(false);
  }, [memberId]);

  const remove = async (manual = false) => {
    // 첫 확인창의 오래된 콜백도 여기로 온다. 화면 재렌더 전이라도 현재 회원과 다르면 보내지 않는다.
    if (inFlight.current || !memberId || getCurrentMemberId() !== memberId) return;
    const revision = identityRevision.current;
    let changedAccount = false;
    const unsubscribe = subscribeToMember((id) => { if (id !== undefined && id !== memberId) changedAccount = true; });
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await deleteAccount({ expectedUserId: memberId, ...(manual ? { appleManualRevocationAcknowledged: true } : {}) });
      const currentId = getCurrentMemberId();
      // 자신의 탈퇴 성공으로 회원이 비워진 경우는 안내한다. 다른 회원의 세션에는 적용하지 않는다.
      if (changedAccount || identityRevision.current !== revision || (currentId !== undefined && currentId !== memberId)) return;
      setShowHelp(false);
      onDeleted(result.appleRevocation === 'manual'
        ? L('회원 정보는 삭제했어요. Apple 연결은 자동 해제되지 않았으니 안내대로 직접 해제해 주세요.', "Your account was deleted. Your Apple connection wasn't removed automatically, so please remove it using the steps.")
        : result.appleRevocation === 'revoked'
          ? L('탈퇴하고 Apple 연결을 해제했어요.', 'Account deleted and Apple connection removed.')
          : L('탈퇴했어요. 그동안 고마웠어요.', 'Your account was deleted. Thanks for being here.'));
    } catch (error) {
      if (changedAccount || identityRevision.current !== revision || getCurrentMemberId() !== memberId) return;
      if (error instanceof AppleRevocationError) setShowHelp(true);
      else if (error instanceof AuthCancelled) { setShowHelp(false); onCancelled(); }
      else if (error instanceof SessionMissing) { setShowHelp(false); onSessionMissing(); }
      else onError(error instanceof Error ? error.message : L('탈퇴를 마치지 못했어요. 잠시 후 다시 시도해주세요.', "Couldn't delete your account. Try again in a moment."));
    } finally {
      unsubscribe();
      inFlight.current = false;
      setBusy(false);
    }
  };

  return {
    remove: () => remove(),
    busy,
    sheet: showHelp ? <AppleDeletionHelp key={memberId} busy={busy} onCancel={() => { if (!inFlight.current) setShowHelp(false); }} onRetry={() => remove()} onManualDelete={() => remove(true)} /> : null,
  };
}

function AppleDeletionHelp({ busy, onCancel, onRetry, onManualDelete }: { busy: boolean; onCancel: () => void; onRetry: () => void; onManualDelete: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const close = () => { if (!busy) onCancel(); };
  const linkProps = Platform.OS === 'web'
    ? { href: APPLE_HELP_URL, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } }
    : { onPress: () => Linking.openURL(APPLE_HELP_URL).catch(() => setLinkError(true)) };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal onAccessibilityEscape={close} style={[styles.sheet, { backgroundColor: theme.background, maxHeight: height - insets.top - insets.bottom - Spacing.lg }]}>
          <ScrollView contentContainerStyle={styles.content}>
            <AppText variant="title2" accessibilityRole="header">{confirming ? L('회원 정보를 삭제할까요?', 'Delete your account?') : L('Apple 연결 해제를 확인하지 못했어요', "Couldn't confirm your Apple connection was removed")}</AppText>
            {confirming ? (
              <>
                <AppText variant="body">{L('회원 정보와 서버 이용 기록을 삭제하며 되돌릴 수 없어요. 이 기기의 채팅방은 남아 있어요.', "This deletes your account and server usage history, and it can't be undone. Chats on this device will stay.")}</AppText>
                <AppText variant="bodyStrong">{MANUAL_NOTICE}</AppText>
                <AppText variant="small" color="textSecondary">{L(
                  `스토어 구독도 취소되지 않아요. ${subscriptionStoreName(Platform.OS)}에서 구독을 별도로 취소해 주세요.`,
                  `This doesn't cancel store subscriptions. Cancel them separately in ${subscriptionStoreName(Platform.OS, LANG)}.`,
                )}</AppText>
                <Button title={L('회원 정보 삭제', 'Delete account')} variant="danger" disabled={!acknowledged || busy} loading={busy} onPress={() => { if (acknowledged && !busy) onManualDelete(); }} />
                <Button title={L('안내로 돌아가기', 'Back to steps')} variant="soft" disabled={busy} onPress={() => setConfirming(false)} />
              </>
            ) : (
              <>
                <AppText variant="body">{L('회원 정보는 아직 삭제하지 않았어요. Apple 연결 해제를 다시 시도하거나, 아래 안내를 확인한 뒤 회원 정보 삭제를 계속할 수 있어요.', "Your account hasn't been deleted yet. Try removing the Apple connection again, or read the steps below and continue deleting your account.")}</AppText>
                <Button title={L('Apple 연결 해제 다시 시도', 'Retry removing Apple connection')} disabled={busy} loading={busy} onPress={onRetry} />
                <View style={[styles.guide, { backgroundColor: theme.surface }]}>
                  <AppText variant="bodyStrong">{L('Apple 연결을 직접 해제하는 방법', 'How to remove the Apple connection yourself')}</AppText>
                  <AppText variant="small">{L('iPhone 설정 → 내 이름 → Apple로 로그인에서 이 앱 또는 개발자를 선택하고, 삭제 안내에 따라 연결을 해제하세요.', 'On iPhone, go to Settings → your name → Sign in with Apple, choose this app or developer, and follow the steps to remove it.')}</AppText>
                  <AppText variant="small">{L('웹에서는 account.apple.com → 로그인 및 보안 → Apple로 로그인에서 관리할 수 있어요.', 'On the web, go to account.apple.com → Sign-In and Security → Sign in with Apple.')}</AppText>
                  <AppText variant="smallStrong">{MANUAL_NOTICE}</AppText>
                  <AppText variant="small" color="textSecondary">{L('회원 삭제를 먼저 완료한 뒤 Apple 연결을 해제해 주세요. 같은 개발자의 앱이 묶여 있다면 다른 앱에도 영향을 줄 수 있으니 Apple 화면의 대상을 확인하세요.', "Finish deleting your account first, then remove the Apple connection. If other apps from the same developer are linked, this may affect them too — check what's listed on Apple's screen.")}</AppText>
                  <AppText {...linkProps} accessibilityRole="link" accessibilityLabel={L('Apple 공식 연결 해제 안내', "Apple's official guide to removing the connection")} variant="smallStrong" color="primary" style={styles.link}>{L('Apple 공식 안내 보기 ↗', "View Apple's guide ↗")}</AppText>
                  {linkError ? <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">{L('안내 페이지를 열지 못했어요. 위 설정 경로에서 직접 확인할 수 있어요.', "Couldn't open the page. You can follow the Settings path above instead.")}</AppText> : null}
                </View>
                <Pressable accessibilityRole="checkbox" accessibilityLabel={L('Apple 연결을 직접 해제해야 한다는 안내를 확인했어요', 'I understand I need to remove the Apple connection myself')} accessibilityState={{ checked: acknowledged, disabled: busy }} disabled={busy} onPress={() => setAcknowledged((checked) => !checked)} style={styles.checkbox}>
                  <AppText color="primary">{acknowledged ? '☑' : '□'}</AppText>
                  <AppText variant="small" style={styles.checkLabel}>{L('Apple 연결을 직접 해제해야 한다는 안내를 확인했어요', 'I understand I need to remove the Apple connection myself')}</AppText>
                </Pressable>
                <Button title={L('안내 확인 후 탈퇴 계속', 'Continue deleting account')} variant="danger" disabled={!acknowledged || busy} onPress={() => { if (acknowledged && !busy) setConfirming(true); }} />
              </>
            )}
            <Button title={L('탈퇴 취소', 'Cancel')} variant="ghost" disabled={busy} onPress={close} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: Spacing.lg, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', borderRadius: Radius.xl, overflow: 'hidden' },
  content: { padding: Spacing.lg, gap: Spacing.md },
  guide: { padding: Spacing.md, gap: Spacing.sm, borderRadius: Radius.md },
  link: { paddingVertical: Spacing.sm },
  checkbox: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', paddingVertical: Spacing.sm },
  checkLabel: { flex: 1 },
});
