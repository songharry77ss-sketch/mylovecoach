import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SenditLogo } from '@/components/brand/brand';
import { WhoSheet, type WhoTarget } from '@/components/coach/who-sheet';
import { CrushListItem } from '@/components/crush/crush-list-item';
import { DemoReel } from '@/components/fx/demo-reel';
import { AppText } from '@/components/ui/app-text';
import { GlassHeader } from '@/components/ui/glass-header';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBarScrim, useScrolledPast } from '@/components/ui/system-bars';
import { useTabBarSpace } from '@/components/ui/tab-bar-space';
import { useToast } from '@/components/ui/toast';
import { APP_NAME, APP_NAME_EN } from '@/constants/brand';
import { Brand, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useQuota } from '@/lib/billing/gate';
import { quotaLabel } from '@/lib/billing/quota';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { haptic } from '@/lib/haptics';
import { L } from '@/lib/i18n';
import { deleteImageQuietly, pickImage, type PickedImage } from '@/lib/images';
import { PRIVACY_NOTICE_VERSION, sortCrushes, useAppStore } from '@/store/app-store';

/** 등장 순서 — 위에서부터 50ms 간격으로 살짝 올라온다 (스프링으로 부드럽게 멈춘다, 움직임 줄이기 설정이면 바로 보인다) */
const enter = (step: number) => FadeInDown.delay(step * 50).springify().damping(18);

/**
 * 홈 — 로고(+ 오른쪽 위 남은 무료 알약) → 인사·제목 → 회색 카드 하나(캡처 올리기) → 캡처 없이 적기 → 최근 상담.
 * 1.4 「깔끔하게」 개편(11/12 회의 6·7·10번): 흰 바탕 + 무채색 회색 면, 색은 「캡처 올리기」 버튼 하나. 큰 파란 카드는 작은 회색 카드로,
 * 남은 무료 횟수는 토스 잔액 알약처럼 오른쪽 위에 — 누르면 이용권 화면(「구매 입구가 안 보인다」). 로고가 사라질 만큼 내리면 유리 머리말.
 * 새 채팅방은 탭 바 옆 「새 채팅」 구슬이 맡는다(같은 곳으로 간다) — 목록 머리의 글자 버튼은 겹쳐서 뺐다.
 * 캡처나 상황 적기를 고르면 채팅방이 있을 때 「누구와의 대화예요?」 시트로 보낼 곳만 고르고(최근 대화가 맨 위), 없으면 바로 첫 채팅방을 연다.
 * 속마음 카드·KKTI·비밀 상담·(켰으면) 연애 연습 같은 부가 기능은 「탐색」 탭에 따로 둔다.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const dark = useColorScheme() === 'dark';
  // 흰 바탕 위 회색 면(다크는 한 단계 밝은 면)
  const fill = { backgroundColor: dark ? theme.surfaceElevated : theme.surface };
  // 맨 위 로고가 가려질 만큼 내리면 「센딧」 유리 머리말이 내려온다
  const { scrolled: pastTop, onScroll } = useScrolledPast(64);
  const user = useAppStore((s) => s.user);
  const crushMap = useAppStore((s) => s.crushes);
  const crushes = useMemo(() => sortCrushes(crushMap).filter((c) => !c.secret), [crushMap]);
  const messages = useAppStore((s) => s.messages);
  const hasApiKey = useAppStore((s) => s.hasApiKey);
  const hidePreviews = useAppStore((s) => s.hidePreviews);
  // 바뀐 개인정보 안내를 아직 못 본 기존 이용자 (새 이용자는 첫 화면 동의 창에서 본다). 코치 서버가 없는 데모·개인 키 빌드는 이용 기록을 보내지 않아 띄우지 않는다
  const privacyNoticeDue = useAppStore((s) => s.privacyNoticeSeen < PRIVACY_NOTICE_VERSION) && !isDemoMode && Boolean(APP_CONFIG.apiSameOrigin || APP_CONFIG.apiUrl);
  const dismissPrivacyNotice = useAppStore((s) => s.dismissPrivacyNotice);
  const profileThin = !user?.about?.trim() && !user?.vibes?.length && !user?.goal;
  const name = user?.name?.trim();
  const [busy, setBusy] = useState(false);
  // 「누구와의 대화예요?」 시트 — 캡처를 골랐으면 그 캡처를, 상황 적기면 null 을 들고 연다
  const [who, setWho] = useState<{ image: PickedImage | null } | null>(null);

  const previewFor = (id: string) => {
    const list = messages[id] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.role === 'coach' && m.analysis) return `${L(APP_NAME, 'Coach')}: ${m.analysis.summary}`;
      if (m.role === 'user' && m.text) return `${L('나', 'You')}: ${m.text}`;
      if (m.role === 'user' && m.imageUri) return L('나: 대화 캡처를 보냈어요', 'You: Sent a screenshot');
    }
    return undefined;
  };

  const closePrivacyNotice = (open: boolean) => {
    track('privacy_notice', { action: open ? 'open' : 'dismiss' });
    dismissPrivacyNotice();
    if (open) router.push('/settings/privacy');
  };

  /** 고른 상대의 채팅방으로 — 캡처가 있으면 들어가자마자 분석하고, 없으면 입력창을 열어 둔다 */
  const openRoom = (target: WhoTarget, image: PickedImage | null) => {
    const s = useAppStore.getState();
    // 「새로운 사람」은 늘 새 방 — quickStart 는 이미 방이 있으면 가장 오래된 방을 돌려주므로 방이 하나도 없을 때만 쓴다
    const hasRoom = Object.values(s.crushes).some((c) => !c.secret);
    const id =
      target.kind === 'crush'
        ? target.id
        : target.kind === 'secret'
          ? s.createSecretChat()
          : hasRoom
            ? s.addCrush({ name: L('상대', 'Them'), gender: 'female', relationship: 'talking', style: [], notes: '' }).id
            : s.quickStart();
    track('home_start', { mode: image ? 'image' : 'text', target: target.kind, rooms: crushes.length });
    router.push({ pathname: '/crush/[id]', params: image ? { id, pendingImage: image.uri, pendingWidth: String(image.width) } : { id, compose: '1' } });
  };

  // 캡처부터 고른다 — 채팅방이 있으면 누구와의 대화인지 묻고, 없으면 바로 첫 채팅방에서 분석한다
  const capture = async () => {
    if (busy) return;
    haptic.thud();
    track('home_capture', { rooms: crushes.length });
    setBusy(true);
    try {
      const picked = await pickImage('screenshot');
      if (!picked) return;
      if (crushes.length) setWho({ image: picked });
      else openRoom({ kind: 'new' }, picked);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : L('사진을 불러오지 못했어요.', "Couldn't load the photo."), 'error');
    } finally {
      setBusy(false);
    }
  };

  // 캡처 없이 상황만 적기 — 보낼 채팅방을 고른 뒤 그 방의 입력창에서 바로 적는다
  const write = () => {
    haptic.tap();
    track('home_write', { rooms: crushes.length });
    if (crushes.length) setWho({ image: null });
    else openRoom({ kind: 'new' }, null);
  };

  const pickWho = (target: WhoTarget) => {
    const image = who?.image ?? null;
    haptic.select();
    setWho(null);
    openRoom(target, image);
  };

  const newRoom = () => {
    haptic.thud();
    router.push('/crush/new');
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* 떠 있는 유리 탭 바에 마지막 내용이 가리지 않게 그만큼 아래를 비운다 */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={onScroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.sm, paddingBottom: tabSpace }]}>
        {/* 새 채팅방 + 는 탭 바 옆 「새 채팅」 구슬로 옮겼다 (2026-11-07 팀 제안 — 엄지가 닿는 자리) */}
        <Animated.View entering={enter(0)} style={styles.topRow}>
          <SenditLogo size="sm" />
          <QuotaPill onPress={() => router.push({ pathname: '/paywall', params: { reason: 'banner' } })} />
        </Animated.View>

        {/* 11/12 회의 7번 「AI 티」: 제목 옆 떠다니는 3D 아이콘을 빼고 인사·제목만 */}
        <Animated.View entering={enter(1)} style={styles.greeting}>
          <AppText variant="body" color="textSecondary">
            {name ? L(`${name}님, 안녕하세요`, `Hey ${name}`) : L('안녕하세요', 'Hey there')}
          </AppText>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            {L('어떤 답장을 보내볼까요?', 'What should you text back?')}
          </Text>
        </Animated.View>

        {/* 주인공 — 캡처 올리기. 11/12 회의 6번 「너무 크다」: 큰 파란 카드(약 300pt) → 회색 카드 + 파란 버튼 하나 */}
        <Animated.View entering={enter(2)} style={[styles.captureCard, fill]}>
          <View style={styles.captureTexts}>
            <AppText variant="title3" weight="700">
              {L('카톡 캡처 한 장이면 돼요', 'All it takes is one screenshot')}
            </AppText>
            <AppText variant="small" color="textSecondary">
              {L('답장 3가지와 호감 온도를 바로 알려 줘요', 'Get 3 reply ideas and their interest level, instantly')}
            </AppText>
          </View>
          <CaptureButton busy={busy} onPress={capture} />
        </Animated.View>

        {/* 캡처 없이 상황만 적기 — 회색 알약 입력칸. 누르면 보낼 채팅방을 고른 뒤 그 방 입력창에서 바로 적는다 */}
        <Animated.View entering={enter(3)}>
          <PressableScale onPress={write} feedback={false} pressedScale={0.98} accessibilityLabel={L('캡처 없이 상황만 적기', 'Describe the situation without a screenshot')} style={[styles.writeRow, fill]}>
            <AppText variant="body" color="textTertiary" style={styles.flex} numberOfLines={1}>
              {L('캡처 없이도 괜찮아요 · 상황 적기', 'No screenshot? Just describe it')}
            </AppText>
            <View style={[styles.writeArrow, { backgroundColor: theme.text }]}>
              <Ionicons name="arrow-up" size={18} color={theme.background} />
            </View>
          </PressableScale>
        </Animated.View>

        {privacyNoticeDue ? (
          <Animated.View entering={enter(4)} style={[styles.notice, fill]}>
            <View style={styles.flex}>
              <AppText variant="smallStrong">{L('개인정보 처리방침이 바뀌었어요', 'Our Privacy Policy has changed')}</AppText>
              <AppText variant="caption" color="textSecondary" style={styles.noticeBody}>
                {L(
                  '이제 Anthropic(Claude)이 먼저 답하고, 막히면 OpenAI(GPT)·Google(Gemini)이 대신 답해요. 다음에 AI 기능을 쓸 때 한 번 더 동의를 물어요.',
                  "Anthropic (Claude) now answers first, and OpenAI (GPT) or Google (Gemini) step in if it gets stuck. We'll ask for your consent again the next time you use an AI feature.",
                )}
              </AppText>
              <AppText variant="smallStrong" color="primary" accessibilityRole="link" onPress={() => closePrivacyNotice(true)} style={styles.noticeMore}>
                {L('자세히 보기 · 설정 바꾸기 ›', 'Learn more · Change settings ›')}
              </AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={L('개인정보 안내 닫기', 'Dismiss privacy notice')} onPress={() => closePrivacyNotice(false)} hitSlop={14}>
              <Ionicons name="close" size={18} color={theme.textTertiary} />
            </Pressable>
          </Animated.View>
        ) : null}

        {crushes.length === 0 ? (
          // 아직 채팅방이 없으면 「이렇게 나와요」 시연으로 첫 캡처를 부른다
          <Animated.View entering={enter(5)} style={styles.section}>
            <SectionHeader title={L('이렇게 나와요', "Here's what you get")} style={styles.sectionHeader} />
            <DemoReel />
            <Pressable accessibilityRole="button" onPress={newRoom} hitSlop={8} style={styles.registerLink}>
              <AppText variant="smallStrong" color="textSecondary">
                {L('마음에 둔 사람을 먼저 등록할래요 ›', "I'd rather add my crush first ›")}
              </AppText>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View entering={enter(5)} style={styles.section}>
            {/* 새 채팅방은 바로 아래 탭 바 옆 「새 채팅」 구슬(+)이 맡는다 — 같은 곳으로 가는 글자 버튼을 겹쳐 두지 않는다 */}
            <SectionHeader
              title={L('최근 상담', 'Recent chats')}
              subtitle={L(`${crushes.length}명과 대화 중`, `Talking to ${crushes.length} ${crushes.length === 1 ? 'person' : 'people'}`)} style={styles.sectionHeader} />
            {/* 흰 바탕 위 줄 목록 — 카드·그림자 없이 줄만(피클·토스 목록 결) */}
            <View style={styles.listCard}>
              <View style={styles.listClip}>
                {crushes.map((c, i) => (
                  <Animated.View key={c.id} entering={FadeInDown.delay(300 + 50 * Math.min(i, 8)).duration(360)}>
                    <CrushListItem
                      crush={c}
                      hidePreview={hidePreviews}
                      lastPreview={previewFor(c.id)}
                      divider={i < crushes.length - 1}
                      onPress={() => router.push({ pathname: '/crush/[id]', params: { id: c.id } })}
                    />
                  </Animated.View>
                ))}
              </View>
            </View>
          </Animated.View>
        )}

        {profileThin ? (
          <Animated.View entering={enter(6)}>
            {/* 처음 실행 때와 같은 「센딧과의 짧은 대화」로 묻는다 — 끝나면 홈으로 돌아온다 */}
            <PressableScale
              onPress={() => router.push({ pathname: '/about-me', params: { from: 'home' } })}
              pressedScale={0.98}
              accessibilityLabel={L('나에 대해 알려주세요', 'Tell us about you')}
              style={[styles.profileCard, fill]}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{L('나에 대해 알려주세요 · 30초', 'Tell us about you · 30 sec')}</AppText>
                <AppText variant="small" color="textSecondary">
                  {L('답할수록 더 「나다운」 답장이 나와요', 'The more you share, the more the replies sound like you')}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </PressableScale>
          </Animated.View>
        ) : null}

        {!isDemoMode && !APP_CONFIG.apiSameOrigin && !process.env.EXPO_PUBLIC_API_URL && !hasApiKey ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/settings/api-key')} style={[styles.keyNotice, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name="key-outline" size={18} color={theme.accent} />
            <AppText variant="small" color="accent" style={styles.flex}>
              {L('AI 코치가 아직 연결되지 않았어요. 눌러서 연결하기', "Your AI coach isn't connected yet. Tap to connect")}
            </AppText>
          </Pressable>
        ) : null}
      </ScrollView>
      {/* 밝은 바탕이라 시계·배터리는 기본(검은 글자) 그대로 — 스크롤한 내용이 그 뒤로 비치지 않게 바탕색 띠를 깔고, 로고가 사라지면 유리 머리말 */}
      <StatusBarScrim height={insets.top} color={theme.background} />
      <GlassHeader title={L(APP_NAME, APP_NAME_EN)} top={insets.top} visible={pastTop} />
      <WhoSheet
        visible={who != null}
        crushes={crushes}
        imageUri={who?.image?.uri}
        onPick={pickWho}
        onClose={() => {
          // 고르지 않고 닫으면 방금 고른 캡처 사본(대화 내용)을 바로 지운다
          deleteImageQuietly(who?.image?.uri);
          setWho(null);
        }}
      />
    </View>
  );
}

/** 「캡처 올리기」 — 홈에서 색이 있는 단 하나의 버튼(센딧 파랑 단색) */
function CaptureButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} feedback={false} pressedScale={0.97} accessibilityLabel={L('대화 캡처 올리기', 'Upload a chat screenshot')} accessibilityState={{ busy }} style={styles.capture}>
      {busy ? (
        <ActivityIndicator color={Brand.onBrand} />
      ) : (
        <>
          <Ionicons name="images-outline" size={19} color={Brand.onBrand} />
          <Text style={styles.captureText}>{L('캡처 올리기', 'Upload screenshot')}</Text>
        </>
      )}
    </PressableScale>
  );
}

/** 「처음 5분 무제한」 남은 시간 — 4:12 (분은 0 을 붙이지 않는다) */
export function introClock(ms: number): { text: string; spoken: string } {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return { text: `${m}:${String(s).padStart(2, '0')}`, spoken: m > 0 ? L(`${m}분 ${s}초`, `${m} min ${s} sec`) : L(`${s}초`, `${s} sec`) };
}

/** until 까지 남은 ms — until 이 있는 동안 1초마다 다시 그린다 (값은 그릴 때마다 지금 시각으로 다시 잰다) */
function useCountdown(until: number | null | undefined): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [until]);
  return until ? Math.max(0, until - Date.now()) : 0;
}

/**
 * 오른쪽 위 남은 무료 알약(토스 잔액 알약 결) — 「무료 1회 ›」. 누르면 이용권 화면(11/12 회의 10번 「구매 입구가 안 보인다」).
 * 값은 lib/billing/quota 그대로. 「처음 5분 무제한」 체험 중(intro)이면 1초마다 줄어드는 남은 시간 — 끝나면 useQuota 가 남은 횟수로 돌아간다.
 * 데모·개인 키 빌드(횟수 제한 없음)는 그리지 않는다.
 */
function QuotaPill({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const quota = useQuota();
  const introLeft = useCountdown(quota.kind === 'intro' ? quota.until : null);
  if (!quota.enforced) return null;
  const strong = [styles.pillStrong, { color: theme.primary }];
  let body: React.ReactNode;
  let label: string;
  if (quota.kind === 'intro') {
    const clock = introClock(introLeft);
    label = L(`무제한 체험 중, ${clock.spoken} 남았어요`, `Unlimited trial, ${clock.spoken} left`);
    body = (
      <>
        {L('무제한 ', 'Unlimited ')}
        <Text style={strong}>{clock.text}</Text>
      </>
    );
  } else if (quota.kind === 'premium' || quota.kind === 'team' || quota.kind === 'pass') {
    label = quotaLabel(quota);
    body = L('무제한 이용 중', 'Unlimited');
  } else if (quota.kind === 'exhausted') {
    label = L(`${quotaLabel(quota)}, 이용권 보기`, `${quotaLabel(quota)}, see passes`);
    body = L('이용권 보기', 'Get a pass');
  } else {
    const countKo =
      quota.kind === 'credits'
        ? { lead: '코칭 횟수권 ', short: '횟수권 ', n: quota.remaining, extra: '' }
        : quota.kind === 'bonus'
          ? { lead: '가입 보너스 무료 코칭 ', short: '무료 ', n: quota.bonus ?? quota.remaining, extra: quota.credits ? ` · 횟수권 ${quota.credits}회` : '' }
          : {
              lead: quota.kind === 'daily' ? '오늘 무료 코칭 ' : '무료 코칭 ',
              short: '무료 ',
              n: quota.free ?? quota.remaining,
              extra: `${quota.bonus ? ` · 가입 보너스 ${quota.bonus}회` : ''}${quota.credits ? ` · 횟수권 ${quota.credits}회` : ''}`,
            };
    // 영어판 읽어 주기는 quotaLabel 문장 그대로 (「3 free sessions left」)
    label = L(`${countKo.lead}${countKo.n}회 남았어요${countKo.extra}`, quotaLabel(quota));
    // 남은 횟수는 세어 올라가지 않고 바로 보여 준다 — 0 에서 시작하면 잠깐 「0회」로 보여 다 쓴 줄 안다
    body = L(
      <>
        {countKo.short}
        <Text style={strong}>{countKo.n}회</Text>
      </>,
      // 영어판 「3 free」 · 「10 credits」 — 숫자가 앞
      <>
        <Text style={strong}>{countKo.n}</Text>
        {quota.kind === 'credits' ? (countKo.n === 1 ? ' credit' : ' credits') : ' free'}
      </>,
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={L('이용권 화면을 열어요', 'Opens passes')}
      hitSlop={6}
      onPress={() => {
        haptic.tap();
        track('home_quota_pill', { kind: quota.kind });
        onPress();
      }}
      style={({ pressed }) => [styles.pill, { backgroundColor: dark ? theme.surfaceElevated : theme.surface, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={[styles.pillText, { color: theme.text }]}>{body}</Text>
      <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.xl, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  greeting: { gap: 2, marginTop: -Spacing.sm },
  // 1.4 개편: 26pt → 24pt, 굵기 700
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6 },
  // 회색 카드 — 모서리 24, 안쪽 20 (피클 카드 결)
  captureCard: { borderRadius: 24, padding: Spacing.lg + 4, gap: Spacing.lg, marginTop: -Spacing.xs },
  captureTexts: { gap: 2 },
  // 센딧 파랑 단색 버튼 — 홈의 유일한 색
  capture: {
    height: 50,
    borderRadius: 16,
    backgroundColor: Brand.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  captureText: { color: Brand.onBrand, fontSize: 16, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 34, paddingLeft: 14, paddingRight: 10, borderRadius: Radius.pill },
  pillText: { fontSize: 14, lineHeight: 20, fontWeight: '600', letterSpacing: -0.2 },
  pillStrong: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  section: { gap: Spacing.sm },
  sectionHeader: { marginTop: 0, marginBottom: 0, paddingHorizontal: 2 },
  writeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 2, borderRadius: Radius.pill, paddingLeft: Spacing.lg + 4, paddingRight: 8, minHeight: 54, marginTop: -Spacing.sm },
  writeArrow: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  listCard: { marginHorizontal: -Spacing.lg },
  listClip: { overflow: 'hidden' },
  registerLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.sm },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.lg + 2, borderRadius: 20 },
  noticeBody: { marginTop: 2 },
  noticeMore: { marginTop: Spacing.sm },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: 20, padding: Spacing.lg + 2 },
  keyNotice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.lg, borderRadius: Radius.md },
});
