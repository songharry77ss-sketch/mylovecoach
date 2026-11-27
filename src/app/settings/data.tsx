import { useRouter } from 'expo-router';
import { Alert, Linking, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { QuietLink, SubScreen } from '@/components/ui/sub-screen';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { AI_PROVIDER_LABEL, ensureAiConsent, withdrawAiConsent } from '@/lib/ai-consent';
import { aiRouteOf } from '@/lib/coach-client';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { dateLabel } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { L } from '@/lib/i18n';
import { cleanupOrphanImages, clearImageCaches } from '@/lib/images';
import { useAppStore } from '@/store/app-store';
import { loadApiKey, saveApiKey } from '@/store/storage';

const RESET_MESSAGE = L(
  '채팅방, 캡처, 프로필, 연습 기록과 서버에 남은 이 기기의 이용 기록·코칭 내용을 모두 삭제할까요? AI 분석·코칭 내용 저장 동의도 처음 상태로 돌아가요. 되돌릴 수 없어요.',
  "Delete all chats, screenshots, your profile and practice history, plus this device's usage data and coaching data on our server? Your AI analysis and coaching-data consents will reset too. This can't be undone.",
);

/**
 * 마이 → 개인정보 (11/12 회의 4번 — 예전 마이의 「프라이버시」 묶음 + 맨 아래 「모든 데이터 삭제」).
 * 채팅 미리보기 숨기기 / AI 분석 동의 · 개인정보 설정(이용 기록·코칭 내용 저장) · 처리방침 / 모든 데이터 삭제.
 * 비밀 상담은 마이 첫 화면의 바로 쓰기 칸으로 옮겼다.
 */
export default function DataSettings() {
  const router = useRouter();
  const toast = useToast();
  const resetAll = useAppStore((s) => s.resetAll);
  const hidePreviews = useAppStore((s) => s.hidePreviews);
  const setHidePreviews = useAppStore((s) => s.setHidePreviews);
  const aiConsent = useAppStore((s) => s.aiConsent);
  const aiConsentProvider = useAppStore((s) => s.aiConsentProvider);
  const aiConsentAt = useAppStore((s) => s.aiConsentAt);

  // AI 분석 동의 — 켜면 처음 쓸 때와 같은 동의 시트를 띄우고, 끄면 바로 철회한다 (다음에 AI 를 쓰면 다시 묻는다)
  const toggleAiConsent = async (on: boolean) => {
    if (!on) {
      withdrawAiConsent();
      toast.show(L('AI 분석 동의를 철회했어요. AI 기능을 쓰면 다시 여쭤볼게요.', "AI analysis consent withdrawn. We'll ask again when you use an AI feature."));
      return;
    }
    const route = aiRouteOf(await loadApiKey());
    if (!route) {
      toast.show(L('먼저 AI 코치를 연결해 주세요.', 'Connect your AI coach first.'), 'error');
      return;
    }
    if (await ensureAiConsent(route)) toast.show(L('AI 분석에 동의했어요.', 'You agreed to AI analysis.'), 'success');
  };
  const aiConsentNote =
    aiConsent === true && aiConsentProvider
      ? L(
          `${AI_PROVIDER_LABEL[aiConsentProvider].company} AI로 보내는 데 동의했어요${aiConsentAt ? ` · ${dateLabel(aiConsentAt)}` : ''}`,
          `You agreed to send data to ${AI_PROVIDER_LABEL[aiConsentProvider].company} AI${aiConsentAt ? ` · ${dateLabel(aiConsentAt)}` : ''}`,
        )
      : aiConsent === false
        ? L('동의하지 않았어요. AI 기능을 쓰면 다시 여쭤볼게요.', "You didn't agree. We'll ask again when you use an AI feature.")
        : L('AI 기능을 처음 쓸 때 여쭤볼게요.', "We'll ask the first time you use an AI feature.");

  const confirmReset = () => {
    const run = async () => {
      await saveApiKey(null);
      // 서버에 남은 이 기기의 기록 삭제도 함께 요청된다 (store.resetAll → pendingDeletion)
      resetAll();
      // 캡처·상대 사진 파일을 바로 지운다 (평소 정리는 다음 실행 때 10분 지난 파일만)
      cleanupOrphanImages(new Set(), Date.now(), 0);
      clearImageCaches();
      haptic.heavy();
      toast.show(L('모든 데이터를 삭제했어요.', 'All data deleted.'));
      router.replace('/start');
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(RESET_MESSAGE)) run();
      return;
    }
    Alert.alert(L('모든 데이터 삭제', 'Delete all data'), RESET_MESSAGE, [
      { text: L('취소', 'Cancel'), style: 'cancel' },
      { text: L('삭제', 'Delete'), style: 'destructive', onPress: run },
    ]);
  };

  return (
    <SubScreen title={L('개인정보', 'Privacy')}>
      <ListGroup title={L('채팅 목록', 'Chat list')}>
        <ListRow
          title={L('채팅 미리보기 숨기기', 'Hide chat previews')}
          subtitle={L('채팅 목록에 대화 내용이 보이지 않아요', "Messages won't show in your chat list")}
          right={<Switch accessibilityLabel={L('채팅 미리보기 숨기기', 'Hide chat previews')} value={hidePreviews} onValueChange={setHidePreviews} />}
        />
      </ListGroup>

      <ListGroup title={L('AI · 이용 기록', 'AI & usage data')}>
        {!isDemoMode ? (
          <ListRow
            title={L('AI 분석 동의', 'AI analysis consent')}
            subtitle={aiConsentNote}
            right={<Switch accessibilityLabel={L('AI 분석 동의', 'AI analysis consent')} value={aiConsent === true} onValueChange={toggleAiConsent} />}
          />
        ) : null}
        <ListRow
          title={L('개인정보 설정', 'Privacy settings')}
          subtitle={L('이용 기록 · 코칭 내용 저장 · 삭제 요청', 'Usage data · Saving coaching data · Deletion requests')}
          onPress={() => router.push('/settings/privacy')}
        />
        <ListRow title={L('개인정보 처리방침', 'Privacy Policy')} onPress={() => Linking.openURL(APP_CONFIG.privacyUrl)} />
      </ListGroup>

      {/* 되돌릴 수 없는 삭제는 맨 아래 작은 글자 버튼으로 (예전 마이 맨 아래와 같은 결) */}
      <View style={styles.footer}>
        <AppText variant="caption" color="textSecondary" align="center">
          {L('채팅방·캡처·프로필은 이 기기에 저장돼요', 'Chats, screenshots and your profile are stored on this device')}
        </AppText>
        <QuietLink title={L('모든 데이터 삭제', 'Delete all data')} onPress={confirmReset} />
      </View>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  footer: { marginTop: Spacing.sm, gap: 2, alignItems: 'center' },
});
