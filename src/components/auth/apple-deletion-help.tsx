import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AppleRevocationError, AuthCancelled, deleteAccount, SessionMissing } from '@/lib/auth';

const APPLE_HELP_URL = 'https://support.apple.com/102571';
const MANUAL_NOTICE = 'Apple 연결은 자동 해제되지 않으며 안내대로 직접 해제해야 해요.';

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
        ? '회원 정보는 삭제했어요. Apple 연결은 자동 해제되지 않았으니 안내대로 직접 해제해 주세요.'
        : result.appleRevocation === 'revoked' ? '탈퇴하고 Apple 연결을 해제했어요.' : '탈퇴했어요. 그동안 고마웠어요.');
    } catch (error) {
      if (changedAccount || identityRevision.current !== revision || getCurrentMemberId() !== memberId) return;
      if (error instanceof AppleRevocationError) setShowHelp(true);
      else if (error instanceof AuthCancelled) { setShowHelp(false); onCancelled(); }
      else if (error instanceof SessionMissing) { setShowHelp(false); onSessionMissing(); }
      else onError(error instanceof Error ? error.message : '탈퇴를 마치지 못했어요. 잠시 후 다시 시도해주세요.');
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
            <AppText variant="title2" accessibilityRole="header">{confirming ? '회원 정보를 삭제할까요?' : 'Apple 연결 해제를 확인하지 못했어요'}</AppText>
            {confirming ? (
              <>
                <AppText variant="body">회원 정보와 서버 이용 기록을 삭제하며 되돌릴 수 없어요. 이 기기의 채팅방은 남아 있어요.</AppText>
                <AppText variant="bodyStrong">{MANUAL_NOTICE}</AppText>
                <AppText variant="small" color="textSecondary">스토어 구독도 취소되지 않아요. App Store 또는 Google Play에서 구독을 별도로 취소해 주세요.</AppText>
                <Button title="회원 정보 삭제" variant="danger" disabled={!acknowledged || busy} loading={busy} onPress={() => { if (acknowledged && !busy) onManualDelete(); }} />
                <Button title="안내로 돌아가기" variant="soft" disabled={busy} onPress={() => setConfirming(false)} />
              </>
            ) : (
              <>
                <AppText variant="body">회원 정보는 아직 삭제하지 않았어요. Apple 연결 해제를 다시 시도하거나, 아래 안내를 확인한 뒤 회원 정보 삭제를 계속할 수 있어요.</AppText>
                <Button title="Apple 연결 해제 다시 시도" disabled={busy} loading={busy} onPress={onRetry} />
                <View style={[styles.guide, { backgroundColor: theme.surface }]}>
                  <AppText variant="bodyStrong">Apple 연결을 직접 해제하는 방법</AppText>
                  <AppText variant="small">iPhone 설정 → 내 이름 → Apple로 로그인에서 이 앱 또는 개발자를 선택하고, 삭제 안내에 따라 연결을 해제하세요.</AppText>
                  <AppText variant="small">웹에서는 account.apple.com → 로그인 및 보안 → Apple로 로그인에서 관리할 수 있어요.</AppText>
                  <AppText variant="smallStrong">{MANUAL_NOTICE}</AppText>
                  <AppText variant="small" color="textSecondary">회원 삭제를 먼저 완료한 뒤 Apple 연결을 해제해 주세요. 같은 개발자의 앱이 묶여 있다면 다른 앱에도 영향을 줄 수 있으니 Apple 화면의 대상을 확인하세요.</AppText>
                  <AppText {...linkProps} accessibilityRole="link" accessibilityLabel="Apple 공식 연결 해제 안내" variant="smallStrong" color="primary" style={styles.link}>Apple 공식 안내 보기 ↗</AppText>
                  {linkError ? <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">안내 페이지를 열지 못했어요. 위 설정 경로에서 직접 확인할 수 있어요.</AppText> : null}
                </View>
                <Pressable accessibilityRole="checkbox" accessibilityLabel="Apple 연결을 직접 해제해야 한다는 안내를 확인했어요" accessibilityState={{ checked: acknowledged, disabled: busy }} disabled={busy} onPress={() => setAcknowledged((checked) => !checked)} style={styles.checkbox}>
                  <AppText color="primary">{acknowledged ? '☑' : '□'}</AppText>
                  <AppText variant="small" style={styles.checkLabel}>Apple 연결을 직접 해제해야 한다는 안내를 확인했어요</AppText>
                </Pressable>
                <Button title="안내 확인 후 탈퇴 계속" variant="danger" disabled={!acknowledged || busy} onPress={() => { if (acknowledged && !busy) setConfirming(true); }} />
              </>
            )}
            <Button title="탈퇴 취소" variant="ghost" disabled={busy} onPress={close} />
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
