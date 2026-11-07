import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { GlassTabBar } from '@/components/ui/glass-tab-bar';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

/**
 * 탭 — 떠 있는 유리 탭 바(components/ui/glass-tab-bar) + 오른쪽 「새 채팅」 구슬 버튼 (2026-11-07 팀 제안).
 * 탭 바가 화면 위에 떠 있으므로 탭 화면은 Screen 의 tab(= useTabBarSpace)만큼 아래를 비운다.
 * 기기 아래 영역(아이폰 홈 막대·갤럭시 버튼 3개·제스처)은 탭 바가 스스로 피한다 (tabBarBottom).
 */
export default function TabsLayout() {
  const theme = useTheme();
  // 연애 연습은 기본으로 숨긴다 — 마이 → 추가 기능에서 켜면 탭이 생긴다
  const practiceEnabled = useAppStore((s) => s.practiceEnabled);
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenListeners={{ tabPress: () => haptic.select() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        // 화면 뒤 배경이 탭 바 자리까지 이어지게 (탭 바는 떠 있다)
        sceneStyle: { backgroundColor: theme.background },
        // 글자 크기를 키운 폰에서도 이름·아이콘이 칸 밖으로 밀려 겹치지 않게 (아이폰 기본 탭 바도 키우지 않는다) — 아이콘도 글꼴이라 각자 끈다
        tabBarAllowFontScaling: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: '홈', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={24} color={color} allowFontScaling={false} /> }}
      />
      <Tabs.Screen
        name="practice"
        options={{ title: '연애 연습', href: practiceEnabled ? undefined : null, tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'game-controller' : 'game-controller-outline'} size={24} color={color} allowFontScaling={false} /> }}
      />
      <Tabs.Screen
        name="tips"
        options={{ title: '탐색', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'compass' : 'compass-outline'} size={24} color={color} allowFontScaling={false} /> }}
      />
      <Tabs.Screen
        name="my"
        options={{ title: '마이', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} allowFontScaling={false} /> }}
      />
    </Tabs>
  );
}
