import { Stack, useRouter } from 'expo-router';

import { CrushForm } from '@/components/crush/crush-form';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

export default function NewCrush() {
  const router = useRouter();
  const theme = useTheme();
  const addCrush = useAppStore((s) => s.addCrush);
  return (
    // 폼은 옅은 회색 바탕 위 흰 카드 묶음 — 머리말도 같은 회색으로
    <Screen sheet keyboard background={theme.canvas} contentStyle={{ paddingTop: Spacing.sm }}>
      <Stack.Screen options={{ headerStyle: { backgroundColor: theme.canvas } }} />
      <CrushForm
        submitTitle="채팅방 만들기"
        onSubmit={(value) => {
          const crush = addCrush(value);
          router.dismissTo?.('/(tabs)');
          router.push({ pathname: '/crush/[id]', params: { id: crush.id } });
        }}
      />
    </Screen>
  );
}
