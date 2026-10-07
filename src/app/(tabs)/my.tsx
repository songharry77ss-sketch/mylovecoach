import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { onSalePrice, usePlanProducts } from '@/hooks/use-plan-products';
import { requestServerDeletion, setConsent as setAnalyticsConsentFlag, track } from '@/lib/analytics';
import { isUnlimited, useQuota } from '@/lib/billing/gate';
import { billingSupported, openSubscriptionManagement, restorePremium } from '@/lib/billing/iap';
import { quotaLabel } from '@/lib/billing/quota';
import { refreshTeam } from '@/lib/billing/team';
import { deleteAccount, providerLabel, SessionMissing, signOut } from '@/lib/auth';
import { SIGNUP_BONUS } from '@/lib/billing/plans';
import { authAvailable } from '@/lib/supabase';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import * as Floating from '@/lib/floating';
import { haptic, setHapticsEnabled } from '@/lib/haptics';
import { genderLabel, toneLabel } from '@/lib/labels';
import { useAppStore } from '@/store/app-store';
import { saveApiKey } from '@/store/storage';

export default function MyScreen() {
  const router = useRouter();
  const toast = useToast();
  const user = useAppStore((s) => s.user);
  const kkti = useAppStore((s) => s.kkti);
  const hasApiKey = useAppStore((s) => s.hasApiKey);
  const resetAll = useAppStore((s) => s.resetAll);
  const crushCount = useAppStore((s) => Object.values(s.crushes).filter((c) => !c.secret).length);
  const premium = useAppStore((s) => s.premium);
  const wallet = useAppStore((s) => s.wallet);
  const team = useAppStore((s) => s.team);
  const deviceId = useAppStore((s) => s.deviceId);
  const member = useAppStore((s) => s.member);
  const setPremium = useAppStore((s) => s.setPremium);
  const analyticsConsent = useAppStore((s) => s.analyticsConsent);
  const setAnalyticsConsent = useAppStore((s) => s.setAnalyticsConsent);
  const hapticsOn = useAppStore((s) => s.hapticsOn);
  const setHapticsOn = useAppStore((s) => s.setHapticsOn);
  const hidePreviews = useAppStore((s) => s.hidePreviews);
  const setHidePreviews = useAppStore((s) => s.setHidePreviews);
  const createSecretChat = useAppStore((s) => s.createSecretChat);
  const quota = useQuota();
  const isPremium = quota.enforced && quota.kind === 'premium';
  // 「~부터」 가격은 스토어에서 확인된 가장 싼 상품으로만 적는다
  const products = usePlanProducts();
  const dayPrice = onSalePrice(products, 'day');
  const weeklyPrice = onSalePrice(products, 'weekly');
  const fromPrice = dayPrice ? `하루 ${dayPrice}부터` : weeklyPrice ? `주 ${weeklyPrice}부터` : undefined;

  // 플로팅 버블 (안드로이드) — 권한 설정 화면에서 돌아오면 다시 확인해 켠다
  const [bubbleOn, setBubbleOn] = useState(false);
  const wantBubble = useRef(false);
  const refreshBubble = useCallback(() => {
    if (!Floating.floatingSupported) return;
    if (wantBubble.current && Floating.canDrawOverlays()) {
      wantBubble.current = false;
      if (Floating.start()) {
        haptic.success();
        toast.show('버블을 켰어요. 카톡을 보다가 버블을 톡 누르면 바로 코칭돼요 💬', 'success');
      }
    }
    setBubbleOn(Floating.isRunning());
  }, [toast]);
  useFocusEffect(refreshBubble);
  // 관리자가 방금 팀원으로 등록했어도 마이 탭을 열면 바로 반영되도록
  useFocusEffect(
    useCallback(() => {
      refreshTeam().catch(() => {});
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refreshBubble());
    return () => sub.remove();
  }, [refreshBubble]);

  const toggleBubble = (on: boolean) => {
    if (!on) {
      Floating.stop();
      setBubbleOn(false);
      return;
    }
    if (Floating.canDrawOverlays()) {
      wantBubble.current = true;
      refreshBubble();
      return;
    }
    Alert.alert('다른 앱 위에 표시 권한', '카톡을 쓰면서 버블을 누르려면 「다른 앱 위에 표시」를 허용해 주세요. 목록이 나오면 「연애코치」를 찾아 켜고 돌아오면 버블이 켜져요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '설정 열기',
        onPress: () => {
          wantBubble.current = true;
          Floating.openOverlaySettings();
        },
      },
    ]);
  };

  const restore = async () => {
    const result = await restorePremium();
    if (result) {
      setPremium(result);
      toast.show('구매 내역을 복원했어요.', 'success');
    } else toast.show(result === null ? '복원할 구매 내역이 없어요.' : '스토어에 연결하지 못했어요. 잠시 후 다시 시도해주세요.', result === null ? 'default' : 'error');
  };

  const connection = isDemoMode ? '데모 모드 · 샘플 결과' : APP_CONFIG.apiUrl || APP_CONFIG.apiSameOrigin ? '연결됨 · 코치 서버' : hasApiKey ? '연결됨 · 내 API 키' : '연결 필요';

  const confirm = (title: string, message: string, action: string, run: () => void) => {
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${title}\n\n${message}`)) run();
      return;
    }
    Alert.alert(title, message, [
      { text: '취소', style: 'cancel' },
      { text: action, style: 'destructive', onPress: run },
    ]);
  };

  const logout = () =>
    confirm('로그아웃', '이 기기에서 로그아웃할까요? 다시 로그인하면 그대로 이어서 쓸 수 있어요.', '로그아웃', async () => {
      await signOut();
      toast.show('로그아웃했어요.');
    });

  const withdraw = () =>
    confirm('회원 탈퇴', '회원 정보와 서버에 저장된 이용 기록을 모두 지워요. 이 기기의 채팅방은 남아 있어요. 되돌릴 수 없어요.', '탈퇴', async () => {
      try {
        await deleteAccount();
        haptic.heavy();
        toast.show('탈퇴했어요. 그동안 고마웠어요.');
      } catch (e) {
        if (e instanceof SessionMissing) {
          // 로그인이 끝난 기기 — 다시 로그인하면 이 메뉴에서 이어서 탈퇴할 수 있다
          useAppStore.getState().setMember(null);
          toast.show('로그인이 끝났어요. 다시 로그인한 뒤 탈퇴해주세요.', 'error');
          router.push('/signup');
          return;
        }
        toast.show(e instanceof Error ? e.message : '탈퇴를 마치지 못했어요. 잠시 후 다시 시도해주세요.', 'error');
      }
    });

  const confirmReset = () => {
    const run = async () => {
      await saveApiKey(null);
      resetAll();
      haptic.heavy();
      toast.show('모든 데이터를 삭제했어요.');
      router.replace('/start');
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('채팅방, 캡처, 프로필, 연습 기록을 모두 삭제할까요? 되돌릴 수 없어요.')) run();
      return;
    }
    Alert.alert('모든 데이터 삭제', '채팅방, 캡처, 프로필, 연습 기록을 모두 삭제할까요? 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: run },
    ]);
  };

  const planValue =
    premium?.plan === 'lifetime' ? '평생권' : premium?.plan === 'weekly' ? '주간 구독' : quota.kind === 'team' ? '팀원 무제한' : quota.kind === 'pass' ? '하루 이용권' : '';
  const copyDeviceId = async () => {
    await Clipboard.setStringAsync(deviceId);
    haptic.tap();
    toast.show('기기 ID를 복사했어요. 팀원 등록이 필요하면 관리자에게 보내 주세요.', 'success');
    // 팀원 등록을 하려는 기기만 팀원 여부를 서버에 묻는다
    useAppStore.getState().enableTeamCheck();
    refreshTeam({ force: true }).catch(() => {});
  };
  const walletNote = [wallet.credits > 0 ? `횟수권 ${wallet.credits}회` : null].filter(Boolean).join(' · ');

  return (
    <Screen safeTop>
      <AppText variant="display" style={styles.title}>
        마이
      </AppText>

      <Card tone="primary" onPress={() => router.push('/settings/profile')} style={styles.profile}>
        <Avatar name={user?.name || '나'} size={56} />
        <View style={styles.profileTexts}>
          <AppText variant="title3">{user?.name || '이름 없음'}</AppText>
          <AppText variant="small" color="textSecondary">
            {[user ? genderLabel(user.gender) : null, user?.age ? `${user.age}세` : null, user?.mbti].filter(Boolean).join(' · ') || '프로필을 채워보세요'}
          </AppText>
          <AppText variant="caption" color="primary">
            {user?.vibes?.length ? `✨ ${user.vibes.join(' · ')}` : `기본 톤 ${toneLabel(user?.defaultTone ?? 'natural').emoji} ${toneLabel(user?.defaultTone ?? 'natural').label}`} · 채팅방 {crushCount}개
          </AppText>
          {user?.goal ? (
            <AppText variant="caption" color="accent">
              🎯 {user.goal}
            </AppText>
          ) : null}
        </View>
      </Card>

      {authAvailable ? (
        <>
          <SectionHeader title="계정" />
          {member ? (
            <>
              <ListRow
                icon="person-circle-outline"
                title={`${providerLabel(member.provider)}로 가입됨`}
                subtitle={[member.nickname, `${new Date(member.joinedAt).toLocaleDateString('ko-KR')} 가입`].filter(Boolean).join(' · ')}
              />
              <ListRow icon="log-out-outline" title="로그아웃" onPress={logout} />
              <ListRow icon="person-remove-outline" title="회원 탈퇴" destructive onPress={withdraw} />
            </>
          ) : (
            <ListRow icon="gift-outline" title={`가입하고 무료 코칭 ${SIGNUP_BONUS}회 받기`} subtitle="카카오 · Apple 로 바로 가입" onPress={() => router.push('/signup')} />
          )}
        </>
      ) : null}

      {quota.enforced ? (
        <>
          <SectionHeader title="이용권" />
          {isUnlimited(quota) ? (
            <ListRow
              icon="heart"
              title={`${planValue || '프리미엄'} 이용 중`}
              subtitle={quota.kind === 'pass' ? quotaLabel(quota) : quota.kind === 'team' ? `관리자가 허용한 팀원 기기 · ${team?.label ?? '팀원'}` : undefined}
              value={walletNote || undefined}
              onPress={() => router.push({ pathname: '/paywall', params: { reason: 'my' } })}
            />
          ) : (
            <ListRow icon="heart-outline" title="이용권 보기" subtitle={quotaLabel(quota)} value={fromPrice} onPress={() => router.push({ pathname: '/paywall', params: { reason: 'my' } })} />
          )}
          {billingSupported && premium?.plan === 'weekly' ? <ListRow icon="card-outline" title="구독 관리 · 해지" onPress={() => openSubscriptionManagement().catch(() => {})} /> : null}
          {billingSupported && !isPremium ? <ListRow icon="refresh-outline" title="구매 복원" subtitle="주간 구독·평생권" onPress={restore} /> : null}
        </>
      ) : null}

      <SectionHeader title="바로 쓰기" />
      {Floating.floatingSupported ? (
        <ListRow
          icon="radio-button-on-outline"
          title="플로팅 버블"
          subtitle="카톡을 보다가 화면 위 버블을 누르면 바로 코칭"
          right={<Switch value={bubbleOn} onValueChange={toggleBubble} />}
        />
      ) : (
        <ListRow icon="flash-outline" title="빠른 코칭" subtitle={Platform.OS === 'ios' ? '아이폰 뒷면 두 번 톡으로 바로 열기 안내' : '캡처·복사한 대화로 바로 코칭'} onPress={() => router.push('/quick')} />
      )}
      <ListRow icon="phone-portrait-outline" title="진동 효과" subtitle="온도가 오를 때 두근두근, 넘길 때 톡톡" right={
        <Switch
          value={hapticsOn}
          onValueChange={(v) => {
            setHapticsOn(v);
            setHapticsEnabled(v);
            if (v) haptic.celebrate();
          }}
        />
      } />

      <SectionHeader title="재미" />
      <ListRow icon="flask-outline" title="KKTI 테스트" subtitle="카톡으로 보는 진짜 연애 MBTI" value={kkti ? `${kkti.emoji} ${kkti.code}` : undefined} onPress={() => router.push('/kkti')} />
      <ListRow icon="game-controller-outline" title="연애 연습" subtitle="AI 상대와 카톡 리허설" onPress={() => router.push('/(tabs)/practice')} />

      <SectionHeader title="프라이버시" />
      <ListRow
        icon="glasses-outline"
        title="비밀 상담 시작"
        subtitle="기기에 저장되지 않고, 나가면 대화·캡처가 지워져요"
        onPress={() => {
          const id = createSecretChat();
          router.push({ pathname: '/crush/[id]', params: { id } });
        }}
      />
      <ListRow
        icon="eye-off-outline"
        title="채팅 미리보기 숨기기"
        subtitle="채팅 목록에 대화 내용이 보이지 않아요"
        right={<Switch value={hidePreviews} onValueChange={setHidePreviews} />}
      />
      <ListRow
        icon="bar-chart-outline"
        title="이용 기록 수집 (선택)"
        subtitle="켜면 코칭 질문·답과 화면 이용 기록이 서비스 개선을 위해 서버에 1년 보관돼요. 끄면 서버 기록도 지워요. 캡처 이미지는 저장하지 않아요."
        right={
          <Switch
            value={analyticsConsent === true}
            onValueChange={(v) => {
              if (v) {
                setAnalyticsConsent(true);
                setAnalyticsConsentFlag(true);
                track('analytics_opt_in');
              } else {
                // 끄면 더 보내지 않고(대기 중인 기록도 버림), 서버에 남은 이 기기의 기록을 지워 달라고 한다.
                // 이미 보내는 중이던 기록이 먼저 저장되도록 잠시 뒤에 지운다
                setAnalyticsConsentFlag(false);
                setAnalyticsConsent(false);
                const id = useAppStore.getState().deviceId;
                setTimeout(() => requestServerDeletion(id), 3000);
              }
              toast.show(v ? '이용 기록 수집을 켰어요.' : '이용 기록 수집을 껐어요. 서버에 남은 기록도 지울게요.');
            }}
          />
        }
      />

      <SectionHeader title="AI 코치" />
      <ListRow icon="sparkles-outline" title="AI 코치 연결" value={connection} onPress={() => router.push('/settings/api-key')} />
      <ListRow icon="person-outline" title="내 프로필 · 추구미 · 목표" onPress={() => router.push('/settings/profile')} />

      <SectionHeader title="정보" />
      <ListRow icon="shield-checkmark-outline" title="개인정보 처리방침" onPress={() => Linking.openURL(APP_CONFIG.privacyUrl)} />
      <ListRow icon="document-text-outline" title="이용약관" onPress={() => Linking.openURL(APP_CONFIG.termsUrl)} />
      <ListRow icon="mail-outline" title="문의하기" subtitle={APP_CONFIG.supportEmail} onPress={() => Linking.openURL(`mailto:${APP_CONFIG.supportEmail}`)} />
      <ListRow icon="information-circle-outline" title="앱 버전" value={Constants.expoConfig?.version ?? '1.0.0'} />
      <ListRow icon="finger-print-outline" title="내 기기 ID" subtitle="문의·팀원 등록용 · 눌러서 복사" value={deviceId} onPress={copyDeviceId} />

      <SectionHeader title="데이터" subtitle={analyticsConsent === true ? '채팅방·캡처·프로필은 이 기기에 저장돼요 (이용 기록은 서버에도 보관)' : '채팅방·캡처·프로필은 이 기기에만 저장돼요'} />
      <ListRow icon="trash-outline" title="모든 데이터 삭제" destructive onPress={confirmReset} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: Spacing.sm, marginBottom: Spacing.lg },
  profile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  profileTexts: { flex: 1, gap: 2 },
});
