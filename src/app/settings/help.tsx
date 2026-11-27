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
import { APP_NAME, APP_NAME_EN, APP_SUBTITLE } from '@/constants/brand';
import { useTheme } from '@/hooks/use-theme';
import { openStore } from '@/lib/app-update';
import { refreshTeam } from '@/lib/billing/team';
import { APP_CONFIG } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { L } from '@/lib/i18n';
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
    toast.show(L('기기 ID를 복사했어요. 문의·삭제 요청이나 팀원 등록에 쓰세요.', 'Device ID copied. Use it for support, deletion requests or team sign-up.'), 'success');
    // 팀원 등록을 요청하는 경우에만 팀원 여부를 서버에 묻는다 (문의·삭제 요청 때문에 누른 기기는 기기 ID 를 보내지 않음)
    const requestTeam = () => {
      useAppStore.getState().enableTeamCheck();
      refreshTeam({ force: true }).catch(() => {});
      toast.show(L('관리자가 팀원으로 등록하면 이 기기에 반영돼요 (14일 동안 확인).', "Once an admin adds you to the team, it'll apply to this device (we'll check for 14 days)."), 'success');
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(L('팀원 등록을 요청하나요? 문의·삭제 요청용이면 「취소」를 누르세요.', 'Requesting team access? If this is for support or a deletion request, choose “Cancel.”'))) requestTeam();
      return;
    }
    Alert.alert(
      L('팀원 등록용인가요?', 'Is this for team access?'),
      L(
        '팀원 등록을 요청하면 14일 동안 이 기기가 팀원으로 등록됐는지 서버에 물어요. 문의·삭제 요청용이면 「아니요」를 누르세요.',
        'If you request team access, the app checks with our server for 14 days to see if this device was added. If this is for support or a deletion request, tap “No.”',
      ),
      [
        { text: L('아니요', 'No'), style: 'cancel' },
        { text: L('팀원 등록 요청', 'Request team access'), onPress: requestTeam },
      ],
    );
  };

  return (
    <SubScreen title={L('도움말·정보', 'Help & about')}>
      <ListGroup title={L('도움말', 'Help')}>
        <ListRow
          title={L('사용법 다시 보기', 'See how it works')}
          subtitle={L('캡처 올리기 · 답장 고르기 · 마음 읽기 · 기억', 'Upload screenshots · Pick replies · Read their mind · Memory')}
          onPress={() => router.push({ pathname: '/welcome', params: { from: 'my' } })}
        />
        <ListRow title={L('문의하기', 'Contact us')} subtitle={APP_CONFIG.supportEmail} onPress={() => Linking.openURL(`mailto:${APP_CONFIG.supportEmail}`)} />
        {aiReport.available ? (
          <ListRow
            title={L('AI 답변 신고하기', 'Report an AI response')}
            subtitle={L('불쾌하거나 부적절한 AI 답변을 운영자에게 알려요', 'Tell us about offensive or inappropriate AI responses')}
            onPress={() => aiReport.open()}
          />
        ) : null}
      </ListGroup>

      <ListGroup title={L('앱 정보', 'About')}>
        {appUpdate ? (
          <ListRow
            title={L('앱 버전', 'App version')}
            subtitle={L('새 버전이 나왔어요 · 눌러서 업데이트', 'New version available · Tap to update')}
            value={`${version} → ${appUpdate.latest}`}
            onPress={() =>
              openStore().catch(() =>
                toast.show(
                  L(`스토어를 열지 못했어요. 스토어에서 「${APP_NAME}」이나 「${APP_SUBTITLE}」를 검색해 주세요.`, `Couldn't open the store. Search for “${APP_NAME_EN}” in the store.`),
                  'error',
                ),
              )
            }
          />
        ) : (
          <ListRow title={L('앱 버전', 'App version')} value={version} />
        )}
        <ListRow title={L('이용약관', 'Terms of Service')} onPress={() => Linking.openURL(APP_CONFIG.termsUrl)} />
        <ListRow title={L('개인정보 처리방침', 'Privacy Policy')} onPress={() => Linking.openURL(APP_CONFIG.privacyUrl)} />
        {/* 기기 ID 는 문의·삭제 요청·팀원 등록 때만 쓰여 맨 아래에 — 길어서 오른쪽 값 대신 설명 줄에, 오른쪽은 복사 표시 */}
        <ListRow
          title={L('내 기기 ID', 'My device ID')}
          subtitle={L(`${deviceId} · 문의·팀원 등록용`, `${deviceId} · For support & team sign-up`)}
          onPress={copyDeviceId}
          right={<Ionicons name="copy-outline" size={18} color={theme.textTertiary} accessibilityLabel={L('눌러서 복사', 'Tap to copy')} />}
        />
      </ListGroup>
      {aiReport.sheet}
    </SubScreen>
  );
}
