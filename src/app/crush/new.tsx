import { useRouter } from 'expo-router';

import { CrushForm } from '@/components/crush/crush-form';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useAppStore } from '@/store/app-store';

export default function NewCrush() {
  const router = useRouter();
  const addCrush = useAppStore((s) => s.addCrush);
  return (
    <Screen keyboard contentStyle={{ paddingTop: Spacing.sm }}>
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
