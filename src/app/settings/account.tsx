import { useRouter } from 'expo-router';
import { Alert, Linking, Platform, StyleSheet, View } from 'react-native';

import { useAccountDeletion } from '@/components/auth/apple-deletion-help';
import { AppText } from '@/components/ui/app-text';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { QuietLink, SubScreen } from '@/components/ui/sub-screen';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { providerLabel, signOut } from '@/lib/auth';
import { couponSupported } from '@/lib/billing/coupon';
import { useQuota } from '@/lib/billing/gate';
import { billingSupported, openSubscriptionManagement, restorePremium } from '@/lib/billing/iap';
import { SIGNUP_BONUS, subscriptionStoreName } from '@/lib/billing/plans';
import { formatDate, premiumUntilLabel } from '@/lib/billing/quota';
import { haptic } from '@/lib/haptics';
import { L, LANG } from '@/lib/i18n';
import { authAvailable } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';

/**
 * 마이 → 이용권·계정 (11/12 회의 4번 — 예전 마이의 「이용권」·「계정」 묶음 + 맨 아래 「회원 탈퇴」).
 * 이용권 보기(이용권 상태판)는 마이 첫 화면 맨 위에 있다.
 * 결제도 가입도 없는 빌드(데모·개인 키)에서 주소로 바로 들어오면 빈 화면 대신 한 줄 안내.
 */
export default function AccountSettings() {
  const router = useRouter();
  const toast = useToast();
  const premium = useAppStore((s) => s.premium);
  const member = useAppStore((s) => s.member);
  const setPremium = useAppStore((s) => s.setPremium);
  const quota = useQuota();
  const hasBilling = quota.enforced && billingSupported;
  const isPremium = quota.enforced && quota.kind === 'premium';
  // 1년권: 「2027년 11월 7일까지」 (Android 는 어림한 날짜라 「… 끝날 예정」)
  const premiumOn = quota.kind === 'premium' && premium != null;
  const yearUntil = premiumOn ? premiumUntilLabel(premium) : null;
  const yearPass = premiumOn && premium.plan === 'year';

  const deletion = useAccountDeletion({
    memberId: member?.userId,
    getCurrentMemberId: () => useAppStore.getState().member?.userId,
    subscribeToMember: (listener) => useAppStore.subscribe((state, previous) => {
      if (state.member?.userId !== previous.member?.userId) listener(state.member?.userId);
    }),
    onDeleted: (message) => { haptic.heavy(); toast.show(message); },
    onCancelled: () => toast.show(L('Apple 확인을 취소해 탈퇴하지 않았어요.', 'Apple confirmation was canceled, so your account was not deleted.')),
    onSessionMissing: () => {
      useAppStore.getState().setMember(null);
      toast.show(L('로그인이 끝났어요. 다시 로그인한 뒤 탈퇴해주세요.', 'You were signed out. Sign in again, then delete your account.'), 'error');
      router.push('/signup');
    },
    onError: (message) => toast.show(message, 'error'),
  });

  const restore = async () => {
    const result = await restorePremium();
    if (result) {
      setPremium(result);
      toast.show(L('구매 내역을 복원했어요.', 'Purchases restored.'), 'success');
    } else
      toast.show(
        result === null ? L('복원할 구매 내역이 없어요.', 'No purchases to restore.') : L('스토어에 연결하지 못했어요. 잠시 후 다시 시도해주세요.', "Couldn't connect to the store. Try again in a moment."),
        result === null ? 'default' : 'error',
      );
  };

  const confirm = (title: string, message: string, action: string, run: () => void) => {
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${title}\n\n${message}`)) run();
      return;
    }
    Alert.alert(title, message, [
      { text: L('취소', 'Cancel'), style: 'cancel' },
      { text: action, style: 'destructive', onPress: run },
    ]);
  };

  const logout = () =>
    confirm(
      L('로그아웃', 'Sign out'),
      L('이 기기에서 로그아웃할까요? 다시 로그인하면 그대로 이어서 쓸 수 있어요.', 'Sign out on this device? Sign back in anytime to pick up where you left off.'),
      L('로그아웃', 'Sign out'),
      async () => {
        await signOut();
        toast.show(L('로그아웃했어요.', 'Signed out.'));
      },
    );

  const withdrawMessage = L(
    '회원 정보와 서버에 저장된 이용 기록을 모두 지워요. 이 기기의 채팅방은 남아 있어요. 되돌릴 수 없어요.' +
      `\n\n회원 탈퇴로 스토어 구독이 취소되지는 않아요. ${subscriptionStoreName(Platform.OS)}에서 구독을 별도로 취소해 주세요.` +
      (member?.provider === 'apple' && Platform.OS === 'ios' ? '\n\nApple 과의 연결을 끊기 위해 Apple 확인 창이 한 번 더 떠요.' : '') +
      (member?.provider === 'google' ? '\n\nGoogle 계정의 로그인 연결은 자동 해제되지 않아요. Google 계정의 연결된 앱에서 별도로 해제할 수 있어요.' : ''),
    "This deletes your account and all usage history stored on our server. Chats on this device will stay. This can't be undone." +
      `\n\nDeleting your account doesn't cancel store subscriptions. Cancel them separately in ${subscriptionStoreName(Platform.OS, LANG)}.` +
      (member?.provider === 'apple' && Platform.OS === 'ios' ? '\n\nYou’ll see one more Apple prompt to disconnect your Apple ID.' : '') +
      (member?.provider === 'google' ? "\n\nYour Google sign-in connection isn't removed automatically. You can remove it under connected apps in your Google Account." : ''),
  );

  const withdraw = () => confirm(L('회원 탈퇴', 'Delete account'), withdrawMessage, L('탈퇴', 'Delete'), deletion.remove);

  return (
    // 이 빌드에 있는 것만 제목에 (가입이 없는 빌드는 「이용권」, 스토어 결제가 없는 곳은 「계정」) — 마이의 주제 줄과 같은 이름
    <SubScreen title={hasBilling && authAvailable ? L('이용권·계정', 'Passes & account') : hasBilling ? L('이용권', 'Passes') : L('계정', 'Account')}>
      {hasBilling ? (
        <ListGroup title={L('이용권', 'Passes')}>
          {/* 1년권은 자동 결제가 없어 해지할 것이 없다 — 「해지」 버튼 대신 자동 결제가 없다는 안내만 */}
          {yearPass ? (
            <ListRow
              title={L('1년권 · 자동 결제 없음', '1-year pass · No auto-renewal')}
              subtitle={`${yearUntil ? `${yearUntil} · ` : ''}${L('따로 해지하지 않아도 돼요', 'Nothing to cancel')}`}
            />
          ) : (
            <ListRow
              title={L('구독 관리 · 해지', 'Manage or cancel subscription')}
              onPress={() => openSubscriptionManagement().catch(() => toast.show(L('스토어 구독 관리 화면을 열지 못했어요.', "Couldn't open subscription settings."), 'error'))}
            />
          )}
          {!isPremium ? (
            <ListRow title={L('구매 복원', 'Restore purchases')} subtitle={L('주간 구독·1년권 (예전에 산 평생권 포함)', 'Weekly plan · 1-year pass (incl. lifetime passes bought earlier)')} onPress={restore} />
          ) : null}
        </ListGroup>
      ) : null}

      {/* 쿠폰 — 웹·Android 만 (iOS 는 App Store 지침 3.1.1, lib/billing/coupon) */}
      {couponSupported && !isPremium ? (
        <ListGroup title={L('쿠폰', 'Coupon')}>
          <ListRow
            icon="ticket-outline"
            title={L('쿠폰 코드 입력', 'Enter coupon code')}
            subtitle={L('코드를 넣으면 무제한 이용권을 받아요', 'Redeem a code for unlimited access')}
            onPress={() => router.push('/coupon')}
          />
        </ListGroup>
      ) : null}

      {authAvailable ? (
        <ListGroup title={L('계정', 'Account')}>
          {member ? (
            <ListRow
             
              title={L(`${providerLabel(member.provider)}로 가입됨`, `Signed up with ${providerLabel(member.provider)}`)}
              subtitle={[member.nickname, L(`${new Date(member.joinedAt).toLocaleDateString('ko-KR')} 가입`, `Joined ${formatDate(member.joinedAt)}`)].filter(Boolean).join(' · ')}
            />
          ) : (
            <ListRow
              title={L(`가입하고 무료 코칭 ${SIGNUP_BONUS}회 받기`, `Sign up for ${SIGNUP_BONUS} free sessions`)}
              subtitle={L('카카오 · Google · Apple로 바로 가입', 'Sign up with Google or Apple')}
              onPress={() => router.push('/signup')}
            />
          )}
          {member ? <ListRow title={L('로그아웃', 'Sign out')} onPress={logout} /> : null}
          {member && Platform.OS === 'web' ? (
            <ListRow
              title={L('App Store 구독 관리', 'Manage App Store subscription')}
              onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => toast.show(L('구독 관리 페이지를 열지 못했어요.', "Couldn't open the subscriptions page."), 'error'))}
            />
          ) : null}
          {member && Platform.OS === 'web' ? (
            <ListRow
              title={L('Google Play 구독 관리', 'Manage Google Play subscription')}
              onPress={() => Linking.openURL('https://play.google.com/store/account/subscriptions').catch(() => toast.show(L('구독 관리 페이지를 열지 못했어요.', "Couldn't open the subscriptions page."), 'error'))}
            />
          ) : null}
        </ListGroup>
      ) : null}

      {!hasBilling && !authAvailable ? (
        <AppText variant="small" color="textSecondary" style={styles.empty}>
          {L('이 버전에서는 따로 관리할 이용권이나 계정이 없어요.', 'There are no passes or accounts to manage in this version.')}
        </AppText>
      ) : null}

      {/* 회원 탈퇴는 맨 아래 작은 글자 버튼 — 마이 → 이용권·계정에서 바로 찾을 수 있게 (스토어 계정 삭제 정책) */}
      {authAvailable && member ? (
        <View style={styles.footer}>
          <QuietLink title={deletion.busy ? L('탈퇴 처리 중…', 'Deleting account…') : L('회원 탈퇴', 'Delete account')} onPress={deletion.busy ? undefined : withdraw} />
        </View>
      ) : null}
      {deletion.sheet}
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  footer: { marginTop: Spacing.sm, alignItems: 'center' },
  empty: { paddingHorizontal: Spacing.xs },
});
