import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { entryRoute } from '@/lib/intro-paths';
import { GUIDE_VERSION, useAppStore } from '@/store/app-store';

/**
 * 앱을 처음 화면으로 열 때 갈 곳 (lib/intro-paths 의 entryRoute).
 * 처음이면 사용법 안내, 업데이트한 기존 이용자는 「새로워진 센딧」 사용법 한 번, 그 밖에는 홈(아직 시작 전이면 첫 캡처 화면).
 */
export default function Index() {
  const theme = useTheme();
  const hydrated = useAppStore((s) => s.hydrated);
  const started = useAppStore((s) => Boolean(s.user) || Object.keys(s.crushes).length > 0);
  const onboardingSeen = useAppStore((s) => s.onboardingSeen);
  const guideSeen = useAppStore((s) => s.guideSeen);
  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  return <Redirect href={entryRoute({ started, onboardingSeen, guideSeen }, GUIDE_VERSION)} />;
}
