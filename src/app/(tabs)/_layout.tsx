import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
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
        name="tips"
        options={{ title: '연애 팁', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'sparkles' : 'sparkles-outline'} size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="my"
        options={{ title: '마이', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} /> }}
      />
    </Tabs>
  );
}
