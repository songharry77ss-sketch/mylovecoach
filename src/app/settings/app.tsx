import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { SubScreen } from '@/components/ui/sub-screen';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { APP_NAME } from '@/constants/brand';
import { track } from '@/lib/analytics';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import * as Floating from '@/lib/floating';
import { haptic, setHapticsEnabled } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

/**
 * 마이 → 앱 설정 (11/12 회의 4번 — 예전 마이의 「AI 코치」·「기능」 묶음).
 * 코칭(내 프로필 · AI 코치 연결) / 기능(연애 연습 · 플로팅 버블 · 진동 효과).
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
        toast.show('버블을 켰어요. 카톡을 보다가 버블을 톡 누르면 바로 코칭돼요', 'success');
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
    Alert.alert('다른 앱 위에 표시 권한', `카톡을 쓰면서 버블을 누르려면 「다른 앱 위에 표시」를 허용해 주세요. 목록이 나오면 「${APP_NAME}」을 찾아 켜고 돌아오면 버블이 켜져요.`, [
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

  const togglePractice = (on: boolean) => {
    setPracticeEnabled(on);
    track('practice_toggle', { on });
    if (on) {
      haptic.celebrate();
      toast.show('연애 연습을 켰어요. 아래 탭에서 바로 시작해 보세요', 'success');
    }
  };

  const connection = isDemoMode ? '데모 모드 · 샘플 결과' : APP_CONFIG.apiUrl || APP_CONFIG.apiSameOrigin ? '연결됨 · 코치 서버' : hasApiKey ? '연결됨 · 내 API 키' : '연결 필요';

  return (
    <SubScreen title="앱 설정">
      <ListGroup title="코칭">
        <ListRow icon="person-outline" title="내 프로필 · 추구미 · 목표" onPress={() => router.push('/settings/profile')} />
        <ListRow icon="sparkles-outline" title="AI 코치 연결" value={connection} onPress={() => router.push('/settings/api-key')} />
      </ListGroup>

      <ListGroup title="기능">
        <ListRow
          icon="game-controller-outline"
          title="연애 연습 (베타)"
          subtitle="AI 상대와 카톡 리허설 · 켜면 탭에 생겨요"
          right={<Switch accessibilityLabel="연애 연습 켜기" value={practiceEnabled} onValueChange={togglePractice} />}
        />
        {Floating.floatingSupported ? (
          <ListRow
            icon="radio-button-on-outline"
            title="플로팅 버블"
            subtitle="카톡을 보다가 화면 위 버블을 누르면 바로 코칭"
            right={<Switch accessibilityLabel="플로팅 버블" value={bubbleOn} onValueChange={toggleBubble} />}
          />
        ) : null}
        <ListRow
          icon="phone-portrait-outline"
          title="진동 효과"
          subtitle="온도가 오를 때 두근두근, 넘길 때 톡톡"
          right={
            <Switch
              accessibilityLabel="진동 효과"
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
