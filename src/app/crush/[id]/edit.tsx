import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet } from 'react-native';

import { MemorySheet } from '@/components/coach/memory-sheet';
import { CrushForm } from '@/components/crush/crush-form';
import { EmptyState } from '@/components/ui/empty-state';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { APP_NAME } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteImageQuietly } from '@/lib/images';
import { useAppStore } from '@/store/app-store';

export default function EditCrush() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const crush = useAppStore((s) => (id ? s.crushes[id] : undefined));
  const messages = useAppStore((s) => (id ? s.messages[id] : undefined));
  const updateCrush = useAppStore((s) => s.updateCrush);
  const removeCrush = useAppStore((s) => s.removeCrush);
  const [memoryOpen, setMemoryOpen] = useState(false);

  if (!crush) return <EmptyState emoji="🫥" title="채팅방을 찾을 수 없어요" />;
  const memoryCount = crush.secret ? 0 : (crush.memory?.facts.length ?? 0);
  // 기억은 없어도 지운 이야기 목록이 남아 있으면 시트를 열어 비울 수 있게 한다
  const showMemory = !crush.secret && (memoryCount > 0 || Boolean(crush.memoryForgotten?.length));

  const confirmDelete = () => {
    const run = () => {
      messages?.forEach((m) => deleteImageQuietly(m.imageUri));
      deleteImageQuietly(crush.photoUri);
      removeCrush(crush.id);
      toast.show('채팅방을 삭제했어요.');
      router.dismissTo?.('/(tabs)');
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${crush.name} 채팅방과 모든 캡처를 삭제할까요?`)) run();
      return;
    }
    Alert.alert('채팅방 삭제', `${crush.name} 채팅방과 모든 캡처를 삭제할까요? 되돌릴 수 없어요.`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: run },
    ]);
  };

  return (
    // 폼은 옅은 회색 바탕 위 흰 카드 묶음 — 머리말도 같은 회색으로
    <Screen sheet keyboard background={theme.canvas} contentStyle={styles.content}>
      <Stack.Screen options={{ headerStyle: { backgroundColor: theme.canvas } }} />
      <CrushForm
        initial={crush}
        submitTitle="저장"
        onSubmit={(value) => {
          updateCrush(crush.id, value);
          toast.show('저장했어요.', 'success');
          router.back();
        }}
      />
      {/* 센딧이 기억하는 이야기(채팅방 위 카드와 같은 시트)·채팅방 삭제 — 저장 아래 흰 카드 하나로 */}
      <ListGroup style={styles.more}>
        {showMemory ? (
          <ListRow icon="bookmark-outline" title={`${APP_NAME}이 기억하는 이야기`} value={`${memoryCount}개`} onPress={() => setMemoryOpen(true)} />
        ) : null}
        <ListRow icon="trash-outline" title="채팅방 삭제" subtitle="대화·캡처까지 모두 지워져요" destructive onPress={confirmDelete} />
      </ListGroup>
      {showMemory ? <MemorySheet crushId={crush.id} partnerName={crush.name} visible={memoryOpen} onClose={() => setMemoryOpen(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: Spacing.sm },
  more: { marginTop: Spacing.xl },
});
