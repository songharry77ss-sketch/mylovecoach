import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { AnalysisCard } from '@/components/coach/analysis-card';
import { Composer } from '@/components/coach/composer';
import { heatMeta } from '@/components/coach/heat-gauge';
import { PendingBubble } from '@/components/coach/pending-bubble';
import { UserBubble } from '@/components/coach/user-bubble';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useCoach } from '@/hooks/use-coach';
import { useKeyboardVisible } from '@/hooks/use-keyboard';
import { onSalePrice, usePlanProducts } from '@/hooks/use-plan-products';
import { useTheme } from '@/hooks/use-theme';
import { isUnlimited, useQuota } from '@/lib/billing/gate';
import { quotaLabel } from '@/lib/billing/quota';
import { dateLabel, isSameDay } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { deleteImageQuietly, pickImage, type PickedImage } from '@/lib/images';
import { relationshipLabel } from '@/lib/labels';
import { drawChatQuestions } from '@/lib/mind-cards';
import type { ChatMessage, EmojiPref, Tone } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

export default function CrushChat() {
  const { id, pendingImage, pendingWidth, pendingText } = useLocalSearchParams<{ id: string; pendingImage?: string; pendingWidth?: string; pendingText?: string }>();
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
  const hasDayPass = onSalePrice(usePlanProducts(), 'day') != null;

  const [tone, setTone] = useState<Tone>(user?.defaultTone ?? 'natural');
  const [emoji, setEmoji] = useState<EmojiPref>(user?.emoji ?? 'on');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [questionSeed, setQuestionSeed] = useState(0);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const rootRef = useRef<View>(null);
  const autoSent = useRef(false);
  const keyboardVisible = useKeyboardVisible();
  const secret = Boolean(crush?.secret);

  // 키보드가 얼마나 가리는지 계산하려면 대화 영역이 화면 위에서 얼마나 내려와 있는지(헤더+상태바)를 알아야 한다.
  // expo-router 57 에는 헤더 높이 훅이 없어서 직접 재어 쓴다.
  const [headerOffset, setHeaderOffset] = useState(0);
  const measureHeader = useCallback(() => {
    rootRef.current?.measureInWindow?.((_x, y) => {
      if (typeof y === 'number' && Number.isFinite(y)) setHeaderOffset(y);
    });
  }, []);

  // 첫 프레임에서는 위치가 0 으로 잡히기도 하고, 키보드가 다시 올라올 때 헤더 높이가 달라질 수도 있어
  // 마운트 직후와 키보드가 올라오는 시점에 한 번씩 더 잰다
  useEffect(() => {
    const t = setTimeout(measureHeader, 250);
    return () => clearTimeout(t);
  }, [measureHeader, keyboardVisible]);

  // 비밀 상담: 이 화면을 떠나면 대화·캡처를 모두 지운다 (저장소에도 처음부터 저장되지 않는다)
  // 개발 모드처럼 화면이 잠깐 해제됐다 다시 붙는 경우를 위해 조금 기다렸다가 지운다
  useEffect(() => {
    if (!secret || !id) return;
    const pending = secretWipes.get(id);
    if (pending) clearTimeout(pending);
    return () => {
      secretWipes.set(
        id,
        setTimeout(() => {
          secretWipes.delete(id);
          const s = useAppStore.getState();
          (s.messages[id] ?? []).forEach((m) => deleteImageQuietly(m.imageUri));
          s.removeCrush(id);
        }, 400),
      );
    };
  }, [secret, id]);

  // 무작위 「속마음 질문」 — 🎲 를 누르면 다시 섞는다
  const questions = useMemo(() => {
    if (!crush) return [];
    // 이름을 모르면 「○○님」 자리를 「그 사람」으로 바꾼다 (「그 사람님」이 되지 않게)
    const unnamed = crush.secret || crush.name === '상대';
    const list = drawChatQuestions(3, unnamed ? '§' : crush.name, mulberry(questionSeed + crush.id.length));
    return unnamed ? list.map((q) => q.replace(/§님/g, '그 사람').replace(/§/g, '그 사람')) : list;
  }, [crush, questionSeed]);

  // 기본값으로 만들어진 상대라면, 첫 결과 뒤에 정보를 채우도록 부드럽게 안내한다
  const analyzed = messages.filter((m) => m.analysis).length;
  const needsCrushInfo = !secret && crush?.name === '상대' && !crush?.mbti && analyzed > 0;

  // 코칭을 몇 번 받아 본 무료 이용자에게 한 번만 보여 주는 안내 카드 (닫으면 다시 안 뜸)
  const showUpsell = quota.enforced && !isUnlimited(quota) && freeUsed >= 2 && !upsellDismissed && !sending && analyzed > 0;
  // 두 번 이상 분석했으면 상대 분석 보고서를 권한다
  const showReport = !secret && analyzed >= 2 && !sending;

  // 첫 화면·빠른 코칭에서 고른 캡처(또는 붙여 넣은 글)는 채팅방에 들어오자마자 자동으로 보낸다
  useEffect(() => {
    if (autoSent.current || !crush || (!pendingImage && !pendingText)) return;
    autoSent.current = true;
    send({ crushId: crush.id, image: pendingImage ? { uri: pendingImage, width: Number(pendingWidth) || 0, height: 0 } : null, text: pendingText ?? '', tone, emoji });
    router.setParams({ pendingImage: undefined, pendingWidth: undefined, pendingText: undefined });
  }, [crush, pendingImage, pendingWidth, pendingText, send, tone, emoji, router]);

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages.length, showUpsell, keyboardVisible]);

  // 결과가 도착하는 순간 「톡톡」 진동
  const lastPending = messages[messages.length - 1]?.pending;
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !lastPending) haptic.arrive();
    wasPending.current = Boolean(lastPending);
  }, [lastPending]);

  if (!crush) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState emoji="🫥" title="채팅방을 찾을 수 없어요" actionTitle="홈으로" onAction={() => router.dismissTo?.('/(tabs)')} />
      </View>
    );
  }

  const chooseImage = async () => {
    try {
      const picked = await pickImage('screenshot');
      if (picked) {
        haptic.select();
        setImage(picked);
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '사진을 불러오지 못했어요.', 'error');
    }
  };

  const openPaywall = (reason: 'quota' | 'regenerate' | 'banner') => router.push({ pathname: '/paywall', params: { reason } });

  /** 무료 횟수를 다 썼으면 보내지 않고 프리미엄 안내를 띄운다 (입력한 내용은 그대로 남김) */
  const guardedSend = (input: Parameters<typeof send>[0], reason: 'quota' | 'regenerate' = 'quota'): boolean => {
    if (quota.remaining <= 0) {
      haptic.warning();
      openPaywall(reason);
      return false;
    }
    send(input).then((result) => result === 'blocked' && openPaywall(reason));
    return true;
  };

  const submit = (text: string) => {
    if (!guardedSend({ crushId: crush.id, image, text, tone, emoji })) return false;
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
      emoji,
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
        emoji,
        variationOf: coachMessage.id,
      },
      'regenerate',
    );
  };

  const wipeNow = () => {
    const run = () => {
      haptic.heavy();
      router.back();
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('비밀 상담 기록을 지금 지우고 나갈까요?')) run();
      return;
    }
    Alert.alert('흔적 지우기', '이 비밀 상담의 대화와 캡처를 지금 지우고 나갈까요?', [
      { text: '취소', style: 'cancel' },
      { text: '지우고 나가기', style: 'destructive', onPress: run },
    ]);
  };

  // 입력창 위 안내: 무료 이용자에게만 남은 횟수를 담백하게 보여 준다
  const notice =
    quota.enforced && !isUnlimited(quota)
      ? {
          text: `${quota.kind === 'exhausted' ? '⏳' : '🎁'} ${quotaLabel(quota)}`,
          actionLabel: quota.kind === 'exhausted' ? '지금 이어서 하기' : '무제한 이용',
          onAction: () => openPaywall(quota.kind === 'exhausted' ? 'quota' : 'banner'),
          emphasized: quota.kind === 'exhausted',
        }
      : null;

  const rel = relationshipLabel(crush.relationship);
  const heat = crush.heat ?? 0;
  const hm = heatMeta(heat);
  const lastAnalysisId = [...messages].reverse().find((m) => m.analysis)?.id;

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
          <Animated.View entering={FadeInUp.springify().damping(16)} style={styles.coachRow}>
            <View style={[styles.coachAvatar, { backgroundColor: theme.accentSoft }]}>
              <AppText style={styles.coachAvatarText}>{secret ? '🕶️' : '✨'}</AppText>
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
                  heat={item.heat}
                  // 가장 최근 결과만 처음 볼 때 온도가 차오르는 연출을 보여 준다
                  revealKey={item.id === lastAnalysisId && Date.now() - item.createdAt < 5 * 60 * 1000 ? item.id : undefined}
                  partnerName={secret ? '상대' : crush.name}
                  selectedReplyIndex={item.selectedReplyIndex}
                  onSelectReply={(i) => selectReply(crush.id, item.id, i)}
                  onRegenerate={item.analysis.replies.length ? () => regenerate(item) : undefined}
                  regenerating={sending}
                  secret={secret}
                />
              ) : null}
            </View>
          </Animated.View>
        )}
      </View>
    );
  };

  return (
    <View ref={rootRef} onLayout={measureHeader} style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerTitle: () =>
            secret ? (
              <View style={styles.headerTitle}>
                <View style={[styles.secretIcon, { backgroundColor: theme.text }]}>
                  <AppText style={styles.secretEmoji}>🕶️</AppText>
                </View>
                <View>
                  <AppText variant="bodyStrong">비밀 상담</AppText>
                  <AppText variant="caption" color="textTertiary">
                    나가면 기록이 사라져요
                  </AppText>
                </View>
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/crush/[id]/edit', params: { id: crush.id } })} style={styles.headerTitle}>
                <Avatar name={crush.name} uri={crush.photoUri} size={32} seed={crush.id} />
                <View>
                  <AppText variant="bodyStrong">{crush.name}</AppText>
                  <AppText variant="caption" color="textTertiary">
                    {rel.emoji} {rel.label}
                    {crush.mbti ? ` · ${crush.mbti}` : ''}
                    {` · ${hm.emoji} ${heat}°`}
                  </AppText>
                </View>
              </Pressable>
            ),
          headerRight: () =>
            secret ? (
              <IconButton name="trash-outline" accessibilityLabel="흔적 지우고 나가기" onPress={wipeNow} />
            ) : (
              <View style={styles.headerActions}>
                <IconButton name="analytics-outline" accessibilityLabel="상대 분석 보고서" onPress={() => router.push({ pathname: '/crush/[id]/report', params: { id: crush.id } })} />
                <IconButton name="ellipsis-horizontal" accessibilityLabel="상대 정보" onPress={() => router.push({ pathname: '/crush/[id]/edit', params: { id: crush.id } })} />
              </View>
            ),
        }}
      />

      {secret ? (
        <View style={[styles.secretBanner, { backgroundColor: theme.surface }]}>
          <AppText variant="caption" color="textSecondary" align="center">
            🕶️ 비밀 상담은 기기에 저장되지 않아요. 이 화면을 나가면 대화와 캡처가 모두 지워져요.
          </AppText>
        </View>
      ) : null}

      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={headerOffset}>
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
                emoji={secret ? '🕶️' : '📸'}
                title={secret ? '아무도 모르게 물어보세요' : `${crush.name}님과의 대화를\n캡처해서 올려보세요`}
                description={
                  secret
                    ? '캡처를 올리거나 상황을 적어 주세요. 이 방의 대화는 저장되지 않고 나가는 순간 사라져요.'
                    : '코치가 대화 분위기와 호칭·말투를 읽고, 딱 맞는 답장 여러 버전과 호감 온도를 알려드려요. 캡처가 없다면 상황을 글로 적어도 돼요.'
                }
              />
              {!secret ? (
                <View style={[styles.heatIntro, { backgroundColor: theme.surface }]}>
                  <AppText variant="smallStrong">🌡️ 호감 온도는 0°에서 시작해요</AppText>
                  <AppText variant="caption" color="textSecondary">
                    대화를 올릴 때마다 온도가 오르내려요. 100°까지 올려 보세요!
                  </AppText>
                </View>
              ) : null}
              <View style={styles.starterRow}>
                {STARTERS.map((s) => (
                  <PressableScale
                    key={s}
                    feedback="tap"
                    onPress={() => guardedSend({ crushId: crush.id, image: null, text: s, tone, emoji })}
                    style={[styles.starter, { backgroundColor: theme.surface }]}>
                    <AppText variant="small" color="textSecondary">
                      {s}
                    </AppText>
                  </PressableScale>
                ))}
              </View>
            </View>
          }
          ListFooterComponent={
            needsCrushInfo ? (
              <Animated.View entering={FadeInDown.delay(400)} style={[styles.upsell, { backgroundColor: theme.primarySoft }]}>
                <View style={styles.upsellTexts}>
                  <AppText variant="smallStrong">상대 정보를 알려주면 더 정확해져요</AppText>
                  <AppText variant="caption" color="textSecondary">
                    이름, MBTI, 어떤 사이인지, 부르는 호칭만 알려주면 그 사람에게 맞춘 말투로 답장을 만들어드려요.
                  </AppText>
                </View>
                <View style={styles.upsellActions}>
                  <Button title="상대 정보 입력" size="sm" fullWidth={false} onPress={() => router.push({ pathname: '/crush/[id]/edit', params: { id: crush.id } })} />
                </View>
              </Animated.View>
            ) : showUpsell ? (
              <Animated.View entering={FadeInDown.delay(400)} style={[styles.upsell, { backgroundColor: theme.primarySoft }]}>
                <View style={styles.upsellTexts}>
                  <AppText variant="smallStrong">답장이 도움이 됐나요?</AppText>
                  <AppText variant="caption" color="textSecondary">
                    {hasDayPass ? '하루 이용권이면 오늘 하루 무제한, 마음에 드는 답장이 나올 때까지 받아볼 수 있어요.' : '이용권이면 횟수 제한 없이, 마음에 드는 답장이 나올 때까지 받아볼 수 있어요.'}
                  </AppText>
                </View>
                <View style={styles.upsellActions}>
                  <Button title="이용권 보기" size="sm" fullWidth={false} onPress={() => openPaywall('banner')} />
                  <Button title="괜찮아요" size="sm" variant="ghost" fullWidth={false} onPress={dismissUpsell} />
                </View>
              </Animated.View>
            ) : showReport ? (
              <Animated.View entering={FadeInDown.delay(500)}>
                <PressableScale
                  onPress={() => router.push({ pathname: '/crush/[id]/report', params: { id: crush.id } })}
                  style={[styles.reportCta, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <AppText style={styles.reportEmoji}>📊</AppText>
                  <View style={styles.upsellTexts}>
                    <AppText variant="smallStrong">{crush.name}님 분석 보고서</AppText>
                    <AppText variant="caption" color="textSecondary">
                      성향 · 호감 신호 · 공략법 · 궁합까지 한눈에
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
                </PressableScale>
              </Animated.View>
            ) : null
          }
        />

        <Composer
          tone={tone}
          onToneChange={setTone}
          emoji={emoji}
          onEmojiChange={setEmoji}
          image={image}
          onPickImage={chooseImage}
          onClearImage={() => setImage(null)}
          onSend={submit}
          sending={sending}
          notice={notice}
          questions={messages.length ? questions : undefined}
          onQuestion={(q) => guardedSend({ crushId: crush.id, image: null, text: q, tone, emoji })}
          onShuffleQuestions={() => setQuestionSeed((v) => v + 1)}
        />
      </KeyboardAvoidingView>

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

/** 작은 시드 난수 (같은 시드면 같은 질문 — 화면이 다시 그려질 때마다 질문이 바뀌지 않게) */
function mulberry(seed: number) {
  let a = (seed * 2654435761 + Date.now() / 3.6e6) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EMPTY: ChatMessage[] = [];
/** 비밀 상담 지우기 예약 (채팅방 id → 타이머) */
const secretWipes = new Map<string, ReturnType<typeof setTimeout>>();
const STARTERS = ['첫 메시지 뭐라고 보낼까?', '주말에 만나자고 하고 싶어', '답장이 늦어졌는데 어떻게 하지?'];

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
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
  heatIntro: { alignSelf: 'center', borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: 2, marginBottom: Spacing.lg, alignItems: 'center' },
  starterRow: { gap: Spacing.sm, alignItems: 'center' },
  starter: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.pill },
  upsell: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md, marginLeft: 40 },
  upsellTexts: { gap: 2, flex: 1 },
  upsellActions: { flexDirection: 'row', gap: Spacing.sm },
  reportCta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.lg, marginLeft: 40 },
  reportEmoji: { fontSize: 26, lineHeight: 32 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  secretIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secretEmoji: { fontSize: 16, lineHeight: 20 },
  secretBanner: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '85%' },
  viewerClose: { position: 'absolute', top: 56, right: 20 },
});
