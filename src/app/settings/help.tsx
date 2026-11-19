import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Alert, Linking, Platform } from 'react-native';

import { useAiReport } from '@/components/coach/ai-report-sheet';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { SubScreen } from '@/components/ui/sub-screen';
import { useToast } from '@/components/ui/toast';
import { APP_NAME, APP_SUBTITLE } from '@/constants/brand';
import { useTheme } from '@/hooks/use-theme';
import { openStore } from '@/lib/app-update';
import { refreshTeam } from '@/lib/billing/team';
import { APP_CONFIG } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

/**
 * 마이 → 도움말·정보 (11/12 회의 4번 — 예전 마이의 「정보」 묶음 + AI 답변 신고).
 * 도움말(사용법 다시 보기 · 문의하기 · AI 답변 신고) / 앱 정보(앱 버전 · 이용약관 · 처리방침 · 내 기기 ID).
 */
export default function HelpSettings() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const deviceId = useAppStore((s) => s.deviceId);
  const appUpdate = useAppStore((s) => s.appUpdate);
  const aiReport = useAiReport();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const copyDeviceId = async () => {
    await Clipboard.setStringAsync(deviceId);
    haptic.tap();
    toast.show('기기 ID를 복사했어요. 문의·삭제 요청이나 팀원 등록에 쓰세요.', 'success');
    // 팀원 등록을 요청하는 경우에만 팀원 여부를 서버에 묻는다 (문의·삭제 요청 때문에 누른 기기는 기기 ID 를 보내지 않음)
    const requestTeam = () => {
      useAppStore.getState().enableTeamCheck();
      refreshTeam({ force: true }).catch(() => {});
      toast.show('관리자가 팀원으로 등록하면 이 기기에 반영돼요 (14일 동안 확인).', 'success');
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('팀원 등록을 요청하나요? 문의·삭제 요청용이면 「취소」를 누르세요.')) requestTeam();
      return;
    }
    Alert.alert('팀원 등록용인가요?', '팀원 등록을 요청하면 14일 동안 이 기기가 팀원으로 등록됐는지 서버에 물어요. 문의·삭제 요청용이면 「아니요」를 누르세요.', [
      { text: '아니요', style: 'cancel' },
      { text: '팀원 등록 요청', onPress: requestTeam },
    ]);
  };

  return (
    <SubScreen title="도움말·정보">
      <ListGroup title="도움말">
        <ListRow title="사용법 다시 보기" subtitle="캡처 올리기 · 답장 고르기 · 마음 읽기 · 기억" onPress={() => router.push({ pathname: '/welcome', params: { from: 'my' } })} />
        <ListRow title="문의하기" subtitle={APP_CONFIG.supportEmail} onPress={() => Linking.openURL(`mailto:${APP_CONFIG.supportEmail}`)} />
        {aiReport.available ? (
          <ListRow title="AI 답변 신고하기" subtitle="불쾌하거나 부적절한 AI 답변을 운영자에게 알려요" onPress={() => aiReport.open()} />
        ) : null}
      </ListGroup>

      <ListGroup title="앱 정보">
        {appUpdate ? (
          <ListRow
            title="앱 버전"
            subtitle="새 버전이 나왔어요 · 눌러서 업데이트"
            value={`${version} → ${appUpdate.latest}`}
            onPress={() => openStore().catch(() => toast.show(`스토어를 열지 못했어요. 스토어에서 「${APP_NAME}」이나 「${APP_SUBTITLE}」를 검색해 주세요.`, 'error'))}
          />
        ) : (
          <ListRow title="앱 버전" value={version} />
        )}
        <ListRow title="이용약관" onPress={() => Linking.openURL(APP_CONFIG.termsUrl)} />
        <ListRow title="개인정보 처리방침" onPress={() => Linking.openURL(APP_CONFIG.privacyUrl)} />
        {/* 기기 ID 는 문의·삭제 요청·팀원 등록 때만 쓰여 맨 아래에 — 길어서 오른쪽 값 대신 설명 줄에, 오른쪽은 복사 표시 */}
        <ListRow
          title="내 기기 ID"
          subtitle={`${deviceId} · 문의·팀원 등록용`}
          onPress={copyDeviceId}
          right={<Ionicons name="copy-outline" size={18} color={theme.textTertiary} accessibilityLabel="눌러서 복사" />}
        />
      </ListGroup>
      {aiReport.sheet}
    </SubScreen>
  );
}
