import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { SubScreen } from '@/components/ui/sub-screen';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { APP_NAME, APP_NAME_EN } from '@/constants/brand';
import { track } from '@/lib/analytics';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import * as Floating from '@/lib/floating';
import { haptic, setHapticsEnabled } from '@/lib/haptics';
import { L } from '@/lib/i18n';
import { useAppStore } from '@/store/app-store';

/**
 * 마이 → 앱 설정 (11/12 회의 4번 — 예전 마이의 「AI 코치」·「기능」 묶음).
 * 코칭(내 프로필 · AI 코치 연결) / 기능(연애 연습 · 플로팅 버블 · 진동 효과).
 * 「AI 코치 연결」(개인 API 키 입력)은 데모·개인 키 빌드에서만 보인다 — 코치 서버에 연결된 스토어 빌드는 개인 키를 쓰지 않아
 * 손님에게 개발자 화면(키 입력칸·발급 링크)이 열리지 않게 줄을 숨긴다(1.4 점검 4.11).
 */
export default function AppSettings() {
  const router = useRouter();
  const toast = useToast();
  const hasApiKey = useAppStore((s) => s.hasApiKey);
  const hapticsOn = useAppStore((s) => s.hapticsOn);
  const setHapticsOn = useAppStore((s) => s.setHapticsOn);
  const practiceEnabled = useAppStore((s) => s.practiceEnabled);
  const setPracticeEnabled = useAppStore((s) => s.setPracticeEnabled);

  // 플로팅 버블 (안드로이드) — 권한 설정 화면에서 돌아오면 다시 확인해 켠다
  const [bubbleOn, setBubbleOn] = useState(false);
  const wantBubble = useRef(false);
  const refreshBubble = useCallback(() => {
    if (!Floating.floatingSupported) return;
    if (wantBubble.current && Floating.canDrawOverlays()) {
      wantBubble.current = false;
      if (Floating.start()) {
        haptic.success();
        toast.show(L('버블을 켰어요. 카톡을 보다가 버블을 톡 누르면 바로 코칭돼요', 'Bubble is on. Tap it while you’re texting to get coaching instantly'), 'success');
      }
    }
    setBubbleOn(Floating.isRunning());
  }, [toast]);
  useFocusEffect(refreshBubble);
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
    Alert.alert(
      L('다른 앱 위에 표시 권한', 'Allow display over other apps'),
      L(
        `카톡을 쓰면서 버블을 누르려면 「다른 앱 위에 표시」를 허용해 주세요. 목록이 나오면 「${APP_NAME}」을 찾아 켜고 돌아오면 버블이 켜져요.`,
        `To tap the bubble while texting, allow “Display over other apps.” Find “${APP_NAME_EN}” in the list, turn it on, and come back — the bubble will turn on.`,
      ),
      [
        { text: L('취소', 'Cancel'), style: 'cancel' },
        {
          text: L('설정 열기', 'Open settings'),
          onPress: () => {
            wantBubble.current = true;
            Floating.openOverlaySettings();
          },
        },
      ],
    );
  };

  const togglePractice = (on: boolean) => {
    setPracticeEnabled(on);
    track('practice_toggle', { on });
    if (on) {
      haptic.celebrate();
      toast.show(L('연애 연습을 켰어요. 아래 탭에서 바로 시작해 보세요', 'Practice chat is on. Start it from the tab bar'), 'success');
    }
  };

  const serverConnected = Boolean(APP_CONFIG.apiUrl || APP_CONFIG.apiSameOrigin);
  const showConnection = isDemoMode || !serverConnected;
  const connection = isDemoMode ? L('데모 모드 · 샘플 결과', 'Demo mode · Sample results') : hasApiKey ? L('연결됨 · 내 API 키', 'Connected · My API key') : L('연결 필요', 'Not connected');

  return (
    <SubScreen title={L('앱 설정', 'App settings')}>
      <ListGroup title={L('코칭', 'Coaching')}>
        <ListRow title={L('내 프로필 · 추구미 · 목표', 'My profile · Vibe · Goal')} onPress={() => router.push('/settings/profile')} />
        {showConnection ? <ListRow title={L('AI 코치 연결', 'AI coach connection')} value={connection} onPress={() => router.push('/settings/api-key')} /> : null}
      </ListGroup>

      <ListGroup title={L('기능', 'Features')}>
        <ListRow
          title={L('연애 연습 (베타)', 'Practice chat (beta)')}
          subtitle={L('AI 상대와 카톡 리허설 · 켜면 탭에 생겨요', 'Rehearse texting with an AI match · Adds a tab when on')}
          right={<Switch accessibilityLabel={L('연애 연습 켜기', 'Turn on practice chat')} value={practiceEnabled} onValueChange={togglePractice} />}
        />
        {Floating.floatingSupported ? (
          <ListRow
            title={L('플로팅 버블', 'Floating bubble')}
            subtitle={L('카톡을 보다가 화면 위 버블을 누르면 바로 코칭', 'Tap the on-screen bubble while texting for instant coaching')}
            right={<Switch accessibilityLabel={L('플로팅 버블', 'Floating bubble')} value={bubbleOn} onValueChange={toggleBubble} />}
          />
        ) : null}
        <ListRow
          title={L('진동 효과', 'Haptics')}
          subtitle={L('온도가 오를 때 두근두근, 넘길 때 톡톡', 'A heartbeat when interest rises, a tap when you swipe')}
          right={
            <Switch
              accessibilityLabel={L('진동 효과', 'Haptics')}
              value={hapticsOn}
              onValueChange={(v) => {
                setHapticsOn(v);
                setHapticsEnabled(v);
                if (v) haptic.celebrate();
              }}
            />
          }
        />
      </ListGroup>
    </SubScreen>
  );
}
