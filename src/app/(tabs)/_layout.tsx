import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

export default function TabsLayout() {
  const theme = useTheme();
  // 연애 연습은 기본으로 숨긴다 — 마이 → 추가 기능에서 켜면 탭이 생긴다
  const practiceEnabled = useAppStore((s) => s.practiceEnabled);
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic.select() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarStyle: { backgroundColor: theme.tabBar, borderTopColor: theme.border, height: Platform.OS === 'ios' ? 84 : 68, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: '채팅', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="practice"
        options={{ title: '연애 연습', href: practiceEnabled ? undefined : null, tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'game-controller' : 'game-controller-outline'} size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="tips"
        options={{ title: '탐색', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'sparkles' : 'sparkles-outline'} size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="my"
        options={{ title: '마이', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} /> }}
      />
    </Tabs>
  );
}
