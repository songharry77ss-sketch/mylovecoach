import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

// 탭 하나에 아이콘·이름·위아래 여백이 들어가는 높이 (라이브러리 기본 배치: 여백 5 + 아이콘 28 + 이름 줄 + 여백 5)
const TAB_CONTENT = 52;
const TAB_PAD_TOP = 4;

export default function TabsLayout() {
  const theme = useTheme();
  // 높이를 숫자로 고정하면 아래 시스템 영역(아이폰 홈 막대 34 · 갤럭시 버튼 3개 48)이 그 안에서 빠져 아이콘·이름이 잘린다.
  // 기기마다 그 영역만큼 탭 바를 키우고, 영역이 없는 기기(홈 버튼 아이폰 등)는 바닥에 조금만 띄운다.
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom > 0 ? insets.bottom : 6;
  // 연애 연습은 기본으로 숨긴다 — 마이 → 추가 기능에서 켜면 탭이 생긴다
  const practiceEnabled = useAppStore((s) => s.practiceEnabled);
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic.select() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarStyle: { backgroundColor: theme.tabBar, borderTopColor: theme.border, height: TAB_PAD_TOP + TAB_CONTENT + bottom, paddingTop: TAB_PAD_TOP, paddingBottom: bottom },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: -0.2 },
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
