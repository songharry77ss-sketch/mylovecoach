import { useRouter } from 'expo-router';
import { Alert, Linking, Platform, StyleSheet, Switch, View } from 'react-native';
import Constants from 'expo-constants';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { flushAnalytics, setConsent as setAnalyticsConsentFlag, track } from '@/lib/analytics';
import { useQuota } from '@/lib/billing/gate';
import { billingSupported, openSubscriptionManagement, restorePremium } from '@/lib/billing/iap';
import { quotaLabel } from '@/lib/billing/quota';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { genderLabel, toneLabel } from '@/lib/labels';
import { useAppStore } from '@/store/app-store';
import { saveApiKey } from '@/store/storage';

export default function MyScreen() {
  const router = useRouter();
  const toast = useToast();
  const user = useAppStore((s) => s.user);
  const hasApiKey = useAppStore((s) => s.hasApiKey);
  const resetAll = useAppStore((s) => s.resetAll);
  const crushCount = useAppStore((s) => Object.keys(s.crushes).length);
  const premium = useAppStore((s) => s.premium);
  const setPremium = useAppStore((s) => s.setPremium);
  const analyticsConsent = useAppStore((s) => s.analyticsConsent);
  const setAnalyticsConsent = useAppStore((s) => s.setAnalyticsConsent);
  const quota = useQuota();
  const isPremium = quota.enforced && quota.kind === 'premium';

  const restore = async () => {
    const result = await restorePremium();
    if (result) {
      setPremium(result);
      toast.show('구매 내역을 복원했어요.', 'success');
    } else toast.show(result === null ? '복원할 구매 내역이 없어요.' : '스토어에 연결하지 못했어요. 잠시 후 다시 시도해주세요.', result === null ? 'default' : 'error');
  };

  const connection = isDemoMode ? '데모 모드 · 샘플 결과' : APP_CONFIG.apiUrl || APP_CONFIG.apiSameOrigin ? '연결됨 · 코치 서버' : hasApiKey ? '연결됨 · 내 API 키' : '연결 필요';

  const confirmReset = () => {
    const run = async () => {
      await saveApiKey(null);
      resetAll();
      toast.show('모든 데이터를 삭제했어요.');
      router.replace('/onboarding');
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('채팅방, 캡처, 프로필을 모두 삭제할까요? 되돌릴 수 없어요.')) run();
      return;
    }
    Alert.alert('모든 데이터 삭제', '채팅방, 캡처, 프로필을 모두 삭제할까요? 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <Screen safeTop>
      <AppText variant="display" style={styles.title}>
        마이
      </AppText>

      <Card tone="primary" onPress={() => router.push('/settings/profile')} style={styles.profile}>
        <Avatar name={user?.name ?? '나'} size={56} />
        <View style={styles.profileTexts}>
          <AppText variant="title3">{user?.name ?? '이름 없음'}</AppText>
          <AppText variant="small" color="textSecondary">
            {[user ? genderLabel(user.gender) : null, user?.age ? `${user.age}세` : null, user?.mbti].filter(Boolean).join(' · ') || '프로필을 채워보세요'}
          </AppText>
          <AppText variant="caption" color="primary">
            기본 톤 {toneLabel(user?.defaultTone ?? 'natural').emoji} {toneLabel(user?.defaultTone ?? 'natural').label} · 채팅방 {crushCount}개
          </AppText>
        </View>
      </Card>

      {quota.enforced ? (
        <>
          <SectionHeader title="프리미엄" />
          {isPremium ? (
            <ListRow icon="heart" title="프리미엄 이용 중" value={premium?.plan === 'lifetime' ? '평생권' : '주간 구독'} onPress={() => router.push({ pathname: '/paywall', params: { reason: 'my' } })} />
          ) : (
            <ListRow icon="heart-outline" title="프리미엄 시작하기" subtitle={quotaLabel(quota)} value="무제한 코칭" onPress={() => router.push({ pathname: '/paywall', params: { reason: 'my' } })} />
          )}
          {billingSupported && premium?.plan === 'weekly' ? <ListRow icon="card-outline" title="구독 관리 · 해지" onPress={() => openSubscriptionManagement().catch(() => {})} /> : null}
          {billingSupported && !isPremium ? <ListRow icon="refresh-outline" title="구매 복원" onPress={restore} /> : null}
        </>
      ) : null}

      <SectionHeader title="AI 코치" />
      <ListRow icon="sparkles-outline" title="AI 코치 연결" value={connection} onPress={() => router.push('/settings/api-key')} />
      <ListRow icon="person-outline" title="내 프로필 수정" onPress={() => router.push('/settings/profile')} />

      <SectionHeader title="개인정보" />
      <ListRow
        icon="bar-chart-outline"
        title="이용 기록 수집 (선택)"
        subtitle="서비스 개선에만 사용해요. 캡처 이미지는 저장하지 않아요."
        right={
          <Switch
            value={analyticsConsent === true}
            onValueChange={(v) => {
              if (v) {
                setAnalyticsConsent(true);
                setAnalyticsConsentFlag(true);
                track('analytics_opt_in');
              } else {
                track('analytics_opt_out');
                flushAnalytics(true);
                setAnalyticsConsentFlag(false);
                setAnalyticsConsent(false);
              }
              toast.show(v ? '이용 기록 수집을 켰어요.' : '이용 기록 수집을 껐어요.');
            }}
          />
        }
      />

      <SectionHeader title="정보" />
      <ListRow icon="shield-checkmark-outline" title="개인정보 처리방침" onPress={() => Linking.openURL(APP_CONFIG.privacyUrl)} />
      <ListRow icon="document-text-outline" title="이용약관" onPress={() => Linking.openURL(APP_CONFIG.termsUrl)} />
      <ListRow icon="mail-outline" title="문의하기" subtitle={APP_CONFIG.supportEmail} onPress={() => Linking.openURL(`mailto:${APP_CONFIG.supportEmail}`)} />
      <ListRow icon="information-circle-outline" title="앱 버전" value={Constants.expoConfig?.version ?? '1.0.0'} />

      <SectionHeader title="데이터" subtitle="모든 데이터는 이 기기에만 저장돼요" />
      <ListRow icon="trash-outline" title="모든 데이터 삭제" destructive onPress={confirmReset} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: Spacing.sm, marginBottom: Spacing.lg },
  profile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  profileTexts: { flex: 1, gap: 2 },
});
