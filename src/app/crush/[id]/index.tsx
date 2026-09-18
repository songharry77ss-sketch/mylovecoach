import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { AnalysisCard } from '@/components/coach/analysis-card';
import { Composer } from '@/components/coach/composer';
import { PendingBubble } from '@/components/coach/pending-bubble';
import { UserBubble } from '@/components/coach/user-bubble';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useCoach } from '@/hooks/use-coach';
import { useTheme } from '@/hooks/use-theme';
import { useQuota } from '@/lib/billing/gate';
import { quotaLabel } from '@/lib/billing/quota';
import { dateLabel, isSameDay } from '@/lib/format';
import { pickImage, type PickedImage } from '@/lib/images';
import { relationshipLabel } from '@/lib/labels';
import type { ChatMessage, Tone } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

export default function CrushChat() {
  const { id, pendingImage, pendingWidth } = useLocalSearchParams<{ id: string; pendingImage?: string; pendingWidth?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const crush = useAppStore((s) => (id ? s.crushes[id] : undefined));
  const messages = useAppStore((s) => (id ? s.messages[id] : undefined)) ?? EMPTY;
  const user = useAppStore((s) => s.user);
  const selectReply = useAppStore((s) => s.selectReply);
  const removeMessage = useAppStore((s) => s.removeMessage);
  const freeUsed = useAppStore((s) => s.usage.total);
  const upsellDismissed = useAppStore((s) => s.upsellDismissed);
  const dismissUpsell = useAppStore((s) => s.dismissUpsell);
  const { send, sending } = useCoach();
  const quota = useQuota();

  const [tone, setTone] = useState<Tone>(user?.defaultTone ?? 'natural');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const autoSent = useRef(false);

  // 기본값으로 만들어진 상대라면, 첫 결과 뒤에 정보를 채우도록 부드럽게 안내한다
  const needsCrushInfo = crush?.name === '상대' && !crush?.mbti && messages.some((m) => m.analysis);

  // 코칭을 몇 번 받아 본 무료 이용자에게 한 번만 보여 주는 안내 카드 (닫으면 다시 안 뜸)
  const showUpsell = quota.enforced && quota.kind !== 'premium' && freeUsed >= 2 && !upsellDismissed && !sending && messages.some((m) => m.analysis);

  // 첫 화면에서 고른 캡처는 채팅방에 들어오자마자 자동으로 보낸다
  useEffect(() => {
    if (autoSent.current || !crush || !pendingImage) return;
    autoSent.current = true;
    send({ crushId: crush.id, image: { uri: pendingImage, width: Number(pendingWidth) || 0, height: 0 }, text: '', tone });
    router.setParams({ pendingImage: undefined, pendingWidth: undefined });
  }, [crush, pendingImage, pendingWidth, send, tone, router]);

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages.length, showUpsell]);

  if (!crush) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState emoji="🫥" title="채팅방을 찾을 수 없어요" actionTitle="홈으로" onAction={() => router.dismissTo?.('/(tabs)')} />
      </Screen>
    );
  }

  const chooseImage = async () => {
    try {
      const picked = await pickImage('screenshot');
      if (picked) setImage(picked);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '사진을 불러오지 못했어요.', 'error');
    }
  };

  const openPaywall = (reason: 'quota' | 'regenerate' | 'banner') => router.push({ pathname: '/paywall', params: { reason } });

  /** 무료 횟수를 다 썼으면 보내지 않고 프리미엄 안내를 띄운다 (입력한 내용은 그대로 남김) */
  const guardedSend = (input: Parameters<typeof send>[0], reason: 'quota' | 'regenerate' = 'quota'): boolean => {
    if (quota.remaining <= 0) {
      openPaywall(reason);
      return false;
    }
    send(input).then((result) => result === 'blocked' && openPaywall(reason));
    return true;
  };

  const submit = (text: string) => {
    if (!guardedSend({ crushId: crush.id, image, text, tone })) return false;
    setImage(null);
  };

  const retry = (failed: ChatMessage) => {
    // 실패한 코치 메시지 직전의 사용자 메시지를 다시 보냄
    const idx = messages.findIndex((m) => m.id === failed.id);
    const prev = idx > 0 ? messages[idx - 1] : undefined;
    if (!prev || prev.role !== 'user') return;
    if (quota.remaining <= 0) return openPaywall('quota');
    removeMessage(crush.id, failed.id);
    removeMessage(crush.id, prev.id);
    guardedSend({
      crushId: crush.id,
      image: prev.imageUri ? { uri: prev.imageUri, width: 0, height: 0 } : null,
      text: prev.text?.startsWith('🔄') ? '' : (prev.text ?? ''),
      tone: prev.tone ?? tone,
    });
  };

  const regenerate = (coachMessage: ChatMessage) => {
    const idx = messages.findIndex((m) => m.id === coachMessage.id);
    let prev: ChatMessage | undefined;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && (messages[i].imageUri || messages[i].text)) {
        prev = messages[i];
        if (messages[i].imageUri) break;
      }
    }
    guardedSend(
      {
        crushId: crush.id,
        image: prev?.imageUri ? { uri: prev.imageUri, width: 0, height: 0 } : null,
        text: prev?.text && !prev.text.startsWith('🔄') ? prev.text : '',
        tone,
        variationOf: coachMessage.id,
      },
      'regenerate',
    );
  };

  // 입력창 위 안내: 무료 이용자에게만 남은 횟수를 담백하게 보여 준다
  const notice =
    quota.enforced && quota.kind !== 'premium'
      ? {
          text: `${quota.kind === 'exhausted' ? '⏳' : '🎁'} ${quotaLabel(quota)}`,
          actionLabel: quota.kind === 'exhausted' ? '지금 이어서 하기' : '무제한 이용',
          onAction: () => openPaywall(quota.kind === 'exhausted' ? 'quota' : 'banner'),
          emphasized: quota.kind === 'exhausted',
        }
      : null;


  const rel = relationshipLabel(crush.relationship);

  const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    const prev = messages[index - 1];
    const showDate = !prev || !isSameDay(prev.createdAt, item.createdAt);
    return (
      <View style={styles.item}>
        {showDate ? (
          <AppText variant="caption" color="textTertiary" align="center" style={styles.date}>
            {dateLabel(item.createdAt)}
          </AppText>
        ) : null}
        {item.role === 'user' ? (
          <UserBubble message={item} onPressImage={setViewer} />
        ) : (
          <Animated.View entering={FadeInUp.duration(220)} style={styles.coachRow}>
            <View style={[styles.coachAvatar, { backgroundColor: theme.accentSoft }]}>
              <AppText style={styles.coachAvatarText}>💘</AppText>
            </View>
            <View style={styles.coachBody}>
              {item.pending ? (
                <PendingBubble />
              ) : item.error ? (
                <View style={[styles.error, { backgroundColor: theme.accentSoft }]}>
                  <AppText variant="small" color="danger">
                    {item.error}
                  </AppText>
                  <View style={styles.errorActions}>
                    <Button title="다시 시도" size="sm" variant="secondary" fullWidth={false} onPress={() => retry(item)} />
                    {item.text === 'not_configured' || item.text === 'auth' ? (
                      <Button title="AI 연결 설정" size="sm" variant="soft" fullWidth={false} onPress={() => router.push('/settings/api-key')} />
                    ) : null}
                  </View>
                </View>
              ) : item.analysis ? (
                <AnalysisCard
                  analysis={item.analysis}
                  selectedReplyIndex={item.selectedReplyIndex}
                  onSelectReply={(i) => selectReply(crush.id, item.id, i)}
                  onRegenerate={item.analysis.replies.length ? () => regenerate(item) : undefined}
                  regenerating={sending}
                />
              ) : null}
            </View>
          </Animated.View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/crush/[id]/edit', params: { id: crush.id } })} style={styles.headerTitle}>
              <Avatar name={crush.name} uri={crush.photoUri} size={32} seed={crush.id} />
              <View>
                <AppText variant="bodyStrong">{crush.name}</AppText>
                <AppText variant="caption" color="textTertiary">
                  {rel.emoji} {rel.label}
                  {crush.mbti ? ` · ${crush.mbti}` : ''}
                </AppText>
              </View>
            </Pressable>
          ),
          headerRight: () => (
            <IconButton name="ellipsis-horizontal" accessibilityLabel="상대 정보" onPress={() => router.push({ pathname: '/crush/[id]/edit', params: { id: crush.id } })} />
          ),
        }}
      />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListEmptyComponent={
          <View style={styles.empty}>
            <EmptyState
              emoji="📸"
              title={`${crush.name}님과의 대화를\n캡처해서 올려보세요`}
              description="코치가 대화 분위기를 읽고 딱 맞는 답장 3개와 호감 온도를 알려드려요. 캡처가 없다면 상황을 글로 적어도 돼요."
            />
            <View style={styles.starterRow}>
              {STARTERS.map((s) => (
                <Pressable key={s} accessibilityRole="button" onPress={() => guardedSend({ crushId: crush.id, image: null, text: s, tone })} style={[styles.starter, { backgroundColor: theme.surface }]}>
                  <AppText variant="small" color="textSecondary">
                    {s}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListFooterComponent={
          needsCrushInfo ? (
            <View style={[styles.upsell, { backgroundColor: theme.primarySoft }]}>
              <View style={styles.upsellTexts}>
                <AppText variant="smallStrong">상대 정보를 알려주면 더 정확해져요</AppText>
                <AppText variant="caption" color="textSecondary">
                  이름, MBTI, 어떤 사이인지만 알려주면 그 사람에게 맞춘 말투로 답장을 만들어드려요.
                </AppText>
              </View>
              <View style={styles.upsellActions}>
                <Button title="상대 정보 입력" size="sm" fullWidth={false} onPress={() => router.push({ pathname: '/crush/[id]/edit', params: { id: crush.id } })} />
              </View>
            </View>
          ) : showUpsell ? (
            <View style={[styles.upsell, { backgroundColor: theme.primarySoft }]}>
              <View style={styles.upsellTexts}>
                <AppText variant="smallStrong">답장이 도움이 됐나요?</AppText>
                <AppText variant="caption" color="textSecondary">
                  프리미엄이면 횟수 제한 없이, 마음에 드는 답장이 나올 때까지 받아볼 수 있어요.
                </AppText>
              </View>
              <View style={styles.upsellActions}>
                <Button title="프리미엄 보기" size="sm" fullWidth={false} onPress={() => openPaywall('banner')} />
                <Button title="괜찮아요" size="sm" variant="ghost" fullWidth={false} onPress={dismissUpsell} />
              </View>
            </View>
          ) : null
        }
      />

      <Composer tone={tone} onToneChange={setTone} image={image} onPickImage={chooseImage} onClearImage={() => setImage(null)} onSend={submit} sending={sending} notice={notice} />

      <Modal visible={Boolean(viewer)} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)} accessibilityLabel="닫기">
          {viewer ? <Image source={{ uri: viewer }} style={styles.viewerImage} contentFit="contain" /> : null}
          <View style={styles.viewerClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const EMPTY: ChatMessage[] = [];
const STARTERS = ['첫 메시지 뭐라고 보낼까?', '주말에 만나자고 하고 싶어', '답장이 늦어졌는데 어떻게 하지?'];

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, gap: Spacing.lg, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', flexGrow: 1 },
  item: { gap: Spacing.sm },
  date: { marginBottom: Spacing.sm },
  coachRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  coachAvatar: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  coachAvatarText: { fontSize: 16, lineHeight: 20 },
  coachBody: { flex: 1 },
  error: { borderRadius: Radius.lg, borderTopLeftRadius: Radius.sm, padding: Spacing.lg, gap: Spacing.md },
  errorActions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  empty: { flex: 1, justifyContent: 'center' },
  starterRow: { gap: Spacing.sm, alignItems: 'center' },
  starter: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.pill },
  upsell: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md, marginLeft: 40 },
  upsellTexts: { gap: 2 },
  upsellActions: { flexDirection: 'row', gap: Spacing.sm },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '85%' },
  viewerClose: { position: 'absolute', top: 56, right: 20 },
});
