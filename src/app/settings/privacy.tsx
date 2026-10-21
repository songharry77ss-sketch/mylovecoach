import { Alert, Linking, Platform, StyleSheet, Switch } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { APP_CONFIG } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { BASIC_LOG_DETAIL, BASIC_LOG_NOTICE, CONTENT_CONSENT_DETAIL, CONTENT_CONSENT_SUMMARY, CONTENT_CONSENT_TITLE, optOutMailUrl, privacyUrl } from '@/lib/privacy-copy';
import { useAppStore } from '@/store/app-store';

const LEGACY_DELETE_MESSAGE = '예전 버전에서 보낸 이 기기의 기록(코칭 내용 포함)을 서버에서 모두 지울까요? 앱 안의 채팅방·프로필은 그대로 남아요.';

/**
 * 마이 → 개인정보 설정.
 * - 서비스 이용 기록: 만 14세 이상 기본 수집이라 켜고 끄는 스위치가 없다. 무엇을 왜 모으는지 알리고, 처리 정지·삭제는 메일로 요청받는다
 *   (기기 ID 를 적은 메일을 연다 — 운영자는 관리자 페이지 「기록 삭제」와 Vercel ANALYTICS_OPTOUT_DEVICES 로 처리한다)
 * - 「코칭 내용 저장」(선택): 언제든 켜고 끌 수 있다. 끄면 서버에 저장된 이 기기의 코칭 내용 삭제를 요청한다 (store.setContentConsent → lib/server-deletion)
 * - 예전 버전 첫 화면의 미리 체크된 동의로 보낸 기록이 남아 있을 수 있는 기기는 여기서 지운다
 */
export default function PrivacySettings() {
  const toast = useToast();
  const deviceId = useAppStore((s) => s.deviceId);
  const underAge = useAppStore((s) => s.user?.age != null && s.user.age < 14);
  const contentConsent = useAppStore((s) => s.contentConsent);
  const setContentConsent = useAppStore((s) => s.setContentConsent);
  const legacyServerRecords = useAppStore((s) => s.legacyServerRecords);

  const toggleContent = (on: boolean) => {
    setContentConsent(on);
    track('content_consent', { agreed: on, from: 'settings' });
    toast.show(on ? '코칭 내용 저장에 동의했어요.' : '코칭 내용 저장을 껐어요. 서버에 저장된 코칭 내용도 지울게요.');
  };

  const requestOptOut = () =>
    Linking.openURL(optOutMailUrl(deviceId)).catch(() => toast.show(`메일 앱을 열지 못했어요. ${APP_CONFIG.supportEmail} 로 기기 ID와 함께 보내 주세요.`, 'error'));

  // 예전 첫 화면(미리 체크된 동의)으로 보낸 기록 — 그 동의는 유효한 동의로 보지 않아 서버에 남은 기록을 따로 지우게 한다
  const confirmLegacyDelete = () => {
    const run = () => {
      useAppStore.getState().requestServerDeletion();
      haptic.tap();
      toast.show('서버에 남은 이 기기의 기록을 지울게요.');
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(LEGACY_DELETE_MESSAGE)) run();
      return;
    }
    Alert.alert('서버 기록 지우기', LEGACY_DELETE_MESSAGE, [
      { text: '취소', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <Screen contentStyle={styles.content}>
      <SectionHeader title="서비스 이용 기록" subtitle="자동 수집 · 만 14세 이상" />
      <Card style={styles.card}>
        <AppText variant="small">{BASIC_LOG_NOTICE}</AppText>
        <AppText variant="caption" color="textSecondary">
          {BASIC_LOG_DETAIL}
        </AppText>
      </Card>
      <ListRow icon="mail-outline" title="처리 정지·삭제 요청" subtitle="메일 앱이 열려요 · 이 기기의 ID가 함께 적혀요" onPress={requestOptOut} />
      <ListRow icon="document-text-outline" title="개인정보 처리방침 보기" onPress={() => Linking.openURL(privacyUrl('analytics'))} />

      <SectionHeader title="선택 동의" />
      <ListRow
        icon="chatbubbles-outline"
        title={`${CONTENT_CONSENT_TITLE} (선택)`}
        subtitle={`${CONTENT_CONSENT_SUMMARY}. ${CONTENT_CONSENT_DETAIL}`}
        right={<Switch accessibilityLabel={`${CONTENT_CONSENT_TITLE} (선택)`} value={contentConsent === true} onValueChange={toggleContent} />}
      />
      {underAge ? (
        <AppText variant="caption" color="textTertiary" style={styles.note}>
          프로필 나이가 만 14세 미만이라 켜 두어도 저장하지 않아요.
        </AppText>
      ) : null}
      {legacyServerRecords ? (
        <ListRow
          icon="cloud-offline-outline"
          title="예전에 보낸 이용 기록 지우기"
          subtitle="예전 버전 첫 화면에 미리 체크돼 있던 동의로 보낸 기록(코칭 내용 포함)이 서버에 남아 있을 수 있어요. 누르면 서버에 남은 이 기기의 기록을 모두 지워요."
          onPress={confirmLegacyDelete}
        />
      ) : null}

      <AppText variant="caption" color="textTertiary" style={styles.note}>
        AI 분석 동의는 마이 → 프라이버시에서, 회원 탈퇴와 모든 데이터 삭제는 마이 화면 맨 아래에서 할 수 있어요.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: Spacing.sm },
  card: { gap: Spacing.sm, marginBottom: Spacing.sm },
  note: { paddingHorizontal: Spacing.sm, marginTop: Spacing.sm },
});
