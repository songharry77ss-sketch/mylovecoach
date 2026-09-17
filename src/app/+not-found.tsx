import { Link, Redirect } from 'expo-router';

import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/app-text';

export default function NotFound() {
  if (process.env.EXPO_PUBLIC_DEMO_MODE === '1') return <Redirect href="/" />;
  return (
    <Screen>
      <EmptyState emoji="🫥" title="페이지를 찾을 수 없어요" description="주소가 잘못됐거나 삭제된 채팅방이에요." />
      <Link href="/(tabs)" style={{ alignSelf: 'center' }}>
        <AppText color="primary" variant="bodyStrong">
          홈으로 가기
        </AppText>
      </Link>
    </Screen>
  );
}
