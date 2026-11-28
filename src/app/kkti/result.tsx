import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton, Icon3D } from '@/components/brand/brand';
import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { StatusBarScrim, useScrolledPast } from '@/components/ui/system-bars';
import { useToast } from '@/components/ui/toast';
import { APP_NAME } from '@/constants/brand';
import { Brand, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { L } from '@/lib/i18n';
import { countKkti } from '@/lib/kkti-stat';
import {
  KKTI_SITE,
  KKTI_TYPES,
  codeLetters,
  josa,
  kktiFromCode,
  kktiMatch,
  kktiRole,
  legibleOn,
  mixHex,
  readableTextOn,
  retakeFriend,
  toSaved,
  type KktiAxisResult,
  type KktiMatch,
  type KktiResult,
  type KktiRole,
} from '@/lib/kkti';
import { kktiCopy, type KktiMatchCopy } from '@/lib/kkti-en';
import { toneLabel } from '@/lib/labels';
import { useAppStore } from '@/store/app-store';

/**
 * KKTI 결과 — /kkti/result?a=답코드[&w=상대답코드]
 * 연애 컬러가 유형 카드 안에서 원형으로 퍼지고, 유형 코드 글자가 하나씩 튀어나온 뒤 꽃가루가 터진다(결과 도착의 순간).
 * 1.4 「깔끔하게」 개편: 강한 색은 유형 카드 한 장(스토리에 올리는 공유 그림 — 「연애 컬러」가 내용)에만. 화면 바탕 물들임·
 * 초록·주황 글자·섹션 아이콘 타일·칩과 축의 이모지·맨 아래 파란 카드(로고·배지·3D)를 걷었다.
 * 유형 카드 바로 아래에 할 일(공유 / 나도 테스트)과 코치 한마디 + 「이 유형에 맞춘 답장 코칭 받기」를 올리고,
 * 습관·MBTI·애니어그램·컬러·궁합은 줄로 접어 두었다(누르면 펼친다).
 * 친구가 보낸 링크로 들어온 사람에게는 「나도 테스트하고 궁합 보기」를 먼저 보여 준다.
 * w 가 있으면 둘의 궁합을 함께 보여 준다 — 궁합은 둘 다 테스트를 끝내야 나온다 (공유할 이유를 만든다).
 * 보는 사람은 셋 중 하나: 내 결과(mine) · 내가 보낸 링크로 친구가 돌려보낸 궁합(partner, 주소의 w 가 나) · 그 밖(guest)
 */

type Role = KktiRole;

/** 카톡·인스타 같은 앱 안의 브라우저 — 파일 내려받기가 조용히 무시된다 */
const IN_APP_BROWSER = /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|Line\/|NAVER\(inapp|DaumApps|everytimeApp|; wv\)/i;

/** 공개 연출 시간표 (ms) */
const T = {
  heroFlood: 120,
  label: 320,
  emoji: 420,
  letter: 720,
  letterGap: 170,
  name: 720 + 4 * 170 + 60,
  rest: 1650,
};

const X_INTENT = 'https://x.com/intent/post?text=';
// 영어판은 나라를 빼서 그 사람 나라의 App Store 로 열리게 한다
const APP_STORE_URL = L('https://apps.apple.com/kr/app/id6813404855', 'https://apps.apple.com/app/id6813404855');
/** 아이폰·아이패드의 웹 브라우저로 보고 있는지 (앱스토어 버튼을 보여 줄지) */
const onIosWeb = () => Platform.OS === 'web' && typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
const THREADS_INTENT = 'https://www.threads.net/intent/post?text=';

export default function KktiResultScreen() {
  const params = useLocalSearchParams<{ a?: string | string[]; w?: string | string[] }>();
  const code = Array.isArray(params.a) ? params.a[0] : params.a;
  const withCode = Array.isArray(params.w) ? params.w[0] : params.w;
  const result = useMemo(() => kktiFromCode(code), [code]);
  // 상대 코드가 잘못됐으면 궁합 없이 결과만 보여 준다
  const partner = useMemo(() => kktiFromCode(withCode), [withCode]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          title: result
            ? L(`${result.type.emoji} ${result.type.name} · KKTI`, `${result.type.emoji} ${kktiCopy.type(result.code)?.name ?? result.type.name} · Texting Type Test`)
            : L('KKTI 결과', 'Texting Type Test result'),
        }}
      />
      {result ? <ResultView key={`${result.encoded}-${partner?.encoded ?? ''}`} result={result} partner={partner} /> : <InvalidLink />}
    </>
  );
}

// ───────────────────────── 잘못된 링크 ─────────────────────────

function InvalidLink() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.invalid, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.lg }]}>
      <View style={styles.invalidInner}>
        <Icon3D name="heart" size={96} style={styles.invalidIcon} />
        <AppText variant="title1" align="center">
          {L('결과 링크가 조금 이상해요', 'This result link looks off')}
        </AppText>
        <AppText variant="body" color="textSecondary" align="center">
          {L('링크가 잘렸거나 바뀐 것 같아요.\n12문항, 1분이면 다시 할 수 있어요!', 'It may have been cut off or changed.\n12 questions, 1 minute, and you can take it again!')}
        </AppText>
        <View style={styles.invalidActions}>
          <GradientButton title={L('KKTI 테스트 하러 가기', 'Take the Texting Type Test')} onPress={() => router.replace('/kkti')} />
          <Button title={L('홈으로', 'Home')} variant="ghost" onPress={() => router.replace('/')} />
        </View>
      </View>
    </View>
  );
}

// ───────────────────────── 결과 ─────────────────────────

function ResultView({ result, partner }: { result: KktiResult; partner: KktiResult | null }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const router = useRouter();
  const toast = useToast();
  const celebrate = useCelebrate();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const hydrated = useAppStore((s) => s.hydrated);
  const saved = useAppStore((s) => s.kkti);
  // 내가 끝낸 테스트면 끝나는 순간 저장돼 있다 → 저장된 답과 같으면 「내 결과」, 아니면 친구가 보낸 링크로 본다
  const role: Role = hydrated ? kktiRole(saved, result, partner) : 'guest';
  const mine = role === 'mine';
  const match = useMemo(() => (partner ? kktiMatch(result, partner) : null), [result, partner]);
  // 공유는 내 결과가 있는 사람(mine·partner)만 한다 — 남의 결과를 「나」라고 보내지 않게.
  // 내 결과가 앞에 오게 해서, 링크를 받은 사람이 테스트를 끝내면 나와의 궁합이 나온다
  const myResult = mine ? result : role === 'partner' ? partner : null;
  const theirResult = mine ? partner : role === 'partner' ? result : null;
  // 한국어판은 지금까지와 같은 주소, 그 밖의 언어는 ?l=언어 (받는 사람의 미리보기·카드·결과 화면이 그 언어로)
  const link = kktiCopy.link((myResult ?? result).encoded, theirResult?.encoded);
  const sharingMatch = Boolean(myResult && theirResult);

  const { type, color, mbti, enneagram } = result;
  const ink = readableTextOn(color.hex);
  const inkIsLight = ink === '#FFFFFF';
  const inkSoft = inkIsLight ? 'rgba(255,255,255,0.86)' : 'rgba(25,31,40,0.74)';
  const glass = inkIsLight ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.5)';
  // 흰 바탕 위 회색 면 (다크는 한 단계 밝게)
  const dark = scheme === 'dark';
  const fill = dark ? theme.surfaceElevated : theme.surface;
  // 축 막대는 유형색(캐릭터 색) — 회색 막대 바탕 위에서 보일 만큼만 진하게
  const barFill = legibleOn(color.hex, fill, 1.8);
  const tone = toneLabel(type.recommendedTone);
  // 화면에 보이는 유형·색·애니어그램 문구 (지금 언어). 코드 글자도 영어판은 영어 글자(FRHA) — 링크·저장에는 result.code 그대로
  const shown = kktiCopy.type(result.code) ?? { ...type, code: result.code };
  const colorText = kktiCopy.color(color);
  const ennea = kktiCopy.enneagram(enneagram);
  const letters = codeLetters(shown.code);
  const best = KKTI_TYPES[type.bestMatch];
  const worst = KKTI_TYPES[type.worstMatch];
  const bestShown = best ? kktiCopy.type(best.code) : null;
  const worstShown = worst ? kktiCopy.type(worst.code) : null;
  // SNS 에 올릴 긴 문구(해시태그 포함)와, 카톡·DM 으로 한 사람에게 보낼 짧은 문구
  const text = myResult && theirResult ? kktiCopy.matchShare(myResult, theirResult, link) : kktiCopy.share(myResult ?? result, link);
  const chatText = myResult && theirResult ? kktiCopy.matchChat(myResult, theirResult, link) : kktiCopy.chat(link);

  // 꽃가루가 터질 자리(유형 그림을 못 재면 이 근처)
  const originY = insets.top + 168;
  const heroFlood = useSharedValue(0);
  const emojiRef = useRef<View>(null);
  const fallbackOrigin = useRef({ x: width / 2, y: originY });

  useEffect(() => {
    fallbackOrigin.current = { x: width / 2, y: originY };
  }, [width, originY]);

  // 공개 연출: 카드 안에서 색이 퍼지고 → 글자가 하나씩 톡톡 → 꽃가루 + 하트 (결과 도착의 순간이라 남긴다)
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => {
      timers.push(setTimeout(fn, ms));
    };
    heroFlood.value = withDelay(T.heroFlood, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }));
    haptic.rise();
    for (let i = 0; i < 4; i++) at(T.letter + i * T.letterGap, () => (i === 3 ? haptic.thud() : haptic.select()));
    at(T.name, () => {
      const burst = (x: number, y: number) => {
        celebrate({ kind: 'confetti', count: 34, x, y });
        at(280, () => celebrate({ kind: 'hearts', count: 12, x, y, haptic: false }));
      };
      const node = emojiRef.current;
      const fallback = fallbackOrigin.current;
      if (node && typeof node.measureInWindow === 'function') {
        node.measureInWindow((x, y, w, h) => (w > 0 && h > 0 ? burst(x + w / 2, y + h / 2) : burst(fallback.x, fallback.y)));
      } else {
        burst(fallback.x, fallback.y);
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [celebrate, heroFlood]);

  const heroFloodStyle = useAnimatedStyle(() => ({ transform: [{ scale: heroFlood.value }] }));

  // 공유 링크가 얼마나 다음 사람을 데려오는지 보기 위한 기록 (서비스 이용 기록 — 만 14세 미만은 남지 않는다)
  useEffect(() => {
    if (!hydrated) return;
    if (role === 'guest') {
      track('kkti_open_shared', { pair: Boolean(partner) });
      countKkti('open_shared');
    }
    if (match) {
      track('kkti_match_view', { role, percent: match.percent });
      countKkti('match_view');
    }
  }, [hydrated, role, partner, match]);

  // 예전에 저장한 결과에는 답 코드가 없다 → 내 결과를 다시 열었을 때 채워 둔다 (친구 링크에서 바로 궁합을 볼 수 있게)
  useEffect(() => {
    if (mine && saved && !saved.a) useAppStore.getState().setKkti({ ...saved, a: result.encoded });
  }, [mine, saved, result.encoded]);

  // 결과 카드 그림 주소. 웹은 지금 보고 있는 주소에서 받는다 (KKTI 전용 주소로 들어왔어도 같은 사이트). 한국어가 아니면 영어 카드
  const cardSite = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : KKTI_SITE;
  const storyUrl = kktiCopy.card((myResult ?? result).encoded, theirResult?.encoded, 'story', cardSite);
  const previewUrl = kktiCopy.card((myResult ?? result).encoded, theirResult?.encoded, 'og', cardSite);
  // 미리 받아 둔 스토리 카드 — 누르는 순간 바로 공유 시트를 띄우려면 그림이 이미 있어야 한다 (사파리는 기다린 뒤의 공유를 막는다)
  const storyBlob = useRef<Blob | null>(null);
  useEffect(() => {
    if (role === 'guest') return;
    let alive = true;
    storyBlob.current = null;
    // 링크 미리보기 그림을 미리 한 번 그려 둔다 — 처음 보낸 링크에도 그림이 바로 붙게
    fetch(previewUrl).catch(() => {});
    if (Platform.OS === 'web') {
      fetch(storyUrl)
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => {
          if (alive && blob) storyBlob.current = blob;
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [role, previewUrl, storyUrl]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // 테스트를 새로 시작할 때 상대 코드를 들고 간다 — 끝나면 그 사람과의 궁합이 (다시) 나온다
  const retake = () => {
    haptic.tap();
    track('kkti_cta', { to: 'retake', mine, role });
    const friend = retakeFriend(role, result, partner);
    router.replace(friend ? { pathname: '/kkti', params: { w: friend.encoded } } : '/kkti');
  };

  // 이미 테스트를 끝낸 사람이 친구 결과를 열었을 때 — 저장된 내 답으로 바로 궁합을 본다
  const savedCode = role === 'guest' && saved?.a && saved.a !== result.encoded ? saved.a : null;
  const matchWithSaved = () => {
    if (!savedCode) return;
    haptic.thud();
    track('kkti_cta', { to: 'match_saved' });
    router.replace({ pathname: '/kkti/result', params: { a: savedCode, w: result.encoded } });
  };

  // 친구가 돌려보낸 궁합 링크에서 내 결과 화면으로 (궁합은 그대로)
  const seeMine = () => {
    if (!partner) return;
    haptic.tap();
    track('kkti_cta', { to: 'mine' });
    router.replace({ pathname: '/kkti/result', params: { a: partner.encoded, w: result.encoded } });
  };

  const goCoach = () => {
    haptic.thud();
    track('kkti_cta', { to: 'coach', code: result.code });
    router.replace(useAppStore.getState().user ? '/(tabs)' : '/start');
  };

  const openStore = () => {
    haptic.tap();
    track('kkti_cta', { to: 'appstore', role });
    Linking.openURL(APP_STORE_URL).catch(() => toast.show(L('App Store 를 열지 못했어요.', "Couldn't open the App Store."), 'error'));
  };

  const save = () => {
    useAppStore.getState().setKkti(toSaved(result));
    haptic.success();
    celebrate({ kind: 'sparkles', count: 12, haptic: false });
    toast.show(L('내 프로필에 저장했어요', 'Saved to your profile'), 'success');
  };

  const copy = async (value: string, message: string, channel: string) => {
    track('kkti_share', { channel, match: sharingMatch });
    countKkti('share');
    try {
      await Clipboard.setStringAsync(value);
      haptic.success();
      celebrate({ kind: 'sparkles', count: 10, haptic: false });
      toast.show(message, 'success');
    } catch {
      toast.show(L('복사하지 못했어요. 주소창의 링크를 직접 복사해 주세요.', "Couldn't copy. Please copy the link from the address bar."), 'error');
    }
  };

  const copyLink = () => copy(link, L('링크 복사 완료! 카톡·인스타 스토리 링크에 붙여 넣어 보세요', 'Link copied! Paste it in a text or your IG story link sticker'), 'copy');

  const openIntent = async (channel: 'x' | 'threads') => {
    haptic.tap();
    track('kkti_share', { channel, match: sharingMatch });
    countKkti('share');
    const url = (channel === 'x' ? X_INTENT : THREADS_INTENT) + encodeURIComponent(text);
    try {
      await Linking.openURL(url);
    } catch {
      copy(text, L('앱을 열지 못해서 공유 문구를 복사해 뒀어요', "Couldn't open the app, so we copied the post for you"), `${channel}_fallback`);
    }
  };

  // 시스템 공유 (카톡 등) — 한 사람에게 말 걸듯 보내는 짧은 문구. 웹은 navigator.share 가 있으면 쓰고, 없으면 문구를 복사한다
  const shareSystem = async () => {
    haptic.tap();
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        track('kkti_share', { channel: 'web_share', match: sharingMatch });
        countKkti('share');
        await navigator.share({ title: L('KKTI · 카톡으로 보는 진짜 연애 MBTI', 'Texting Type Test'), text: chatText }).catch(() => {});
        return;
      }
      copy(chatText, L('보낼 문구를 복사했어요. 카톡에 붙여 넣어 보세요', 'Message copied. Paste it into a text!'), 'web_copy');
      return;
    }
    track('kkti_share', { channel: 'system', match: sharingMatch });
    countKkti('share');
    await Share.share({ message: chatText }).catch(() => {});
  };

  // 인스타 스토리에 올릴 세로 카드 그림. 웹은 공유 시트(그림 파일)나 내려받기, 앱은 브라우저로 그림을 연다
  const [savingImage, setSavingImage] = useState(false);
  const saveImage = async () => {
    if (savingImage) return;
    haptic.tap();
    track('kkti_share', { channel: 'image', match: sharingMatch });
    countKkti('share');
    if (Platform.OS !== 'web') {
      toast.show(L('그림이 열리면 길게 눌러 저장해 주세요', 'When the image opens, press and hold to save it'), 'success');
      await Linking.openURL(storyUrl).catch(() => toast.show(L('그림을 열지 못했어요. 잠시 뒤 다시 해 주세요.', "Couldn't open the image. Try again in a bit."), 'error'));
      return;
    }
    // 공유·내려받기가 안 되는 곳의 마지막 방법 — 그림 주소로 가서 길게 눌러 저장한다 (뒤로 가면 결과 화면)
    const openImage = () => {
      toast.show(L('그림을 길게 눌러 저장해 주세요', 'Press and hold the image to save it'), 'success');
      window.location.assign(storyUrl);
    };
    // 앱 안의 브라우저는 내려받기가 조용히 무시돼 「저장했어요」가 거짓말이 된다 → 처음부터 그림을 연다
    if (IN_APP_BROWSER.test(navigator.userAgent)) {
      openImage();
      return;
    }
    setSavingImage(true);
    try {
      let blob = storyBlob.current;
      if (!blob) {
        const res = await fetch(storyUrl);
        if (!res.ok) throw new Error(String(res.status));
        blob = await res.blob();
        storyBlob.current = blob;
      }
      const file = new File([blob], 'kkti.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
      if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file] } as ShareData);
        } catch (e) {
          // 공유 시트를 그냥 닫은 것(AbortError)은 실패가 아니다. 그 밖(기다리는 사이 누른 효력이 끝남 등)은 그림을 연다
          if ((e as { name?: string } | null)?.name !== 'AbortError') openImage();
        }
        return;
      }
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = 'kkti.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      toast.show(L('그림을 내려받았어요. 스토리에 올리고 링크를 붙여 보세요', 'Image saved. Post it to your story and add the link!'), 'success');
    } catch {
      openImage();
    } finally {
      setSavingImage(false);
    }
  };

  // 영어 이름은 글자 수가 많아 기준을 따로 둔다
  const nameSize = shown.name.length > L(8, 14) ? styles.heroNameLong : null;
  // 내려가면 시계·배터리 뒤에 물든 바탕색 띠를 깐다 (글자가 겹쳐 보이지 않게)
  const { scrolled, onScroll } = useScrolledPast();

  return (
    <View style={[styles.flex, styles.clip, { backgroundColor: theme.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + Spacing.xxl }]}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel={L('닫기', 'Close')} onPress={leave} hitSlop={10} style={[styles.iconCircle, { backgroundColor: fill }]}>
            <Ionicons name="close" size={20} color={theme.text} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={retake} hitSlop={6} style={[styles.pill, { backgroundColor: fill }]}>
            <Ionicons name="refresh" size={15} color={theme.textSecondary} />
            <AppText variant="smallStrong" color="textSecondary">
              {L('다시 하기', 'Retake')}
            </AppText>
          </Pressable>
        </View>

        {/* 유형 카드 — 이 화면에서 강한 색은 여기 하나(공유 그림). 연애 컬러가 가운데서 퍼져 카드를 물들인다 */}
        <View style={[styles.hero, { backgroundColor: fill }]}>
          <Animated.View pointerEvents="none" style={[styles.heroFlood, { backgroundColor: color.hex }, heroFloodStyle]} />

          <PopIn delay={T.label}>
            <AppText variant="smallStrong" color={inkSoft}>
              {role === 'mine'
                ? L('나의 KKTI 연애 유형', 'My texting type')
                : role === 'partner'
                  ? L('친구의 KKTI 연애 유형', "My friend's texting type")
                  : L('KKTI 연애 유형', 'Texting type')}
            </AppText>
          </PopIn>
          <PopIn delay={T.emoji} from={0.2}>
            <View ref={emojiRef} collapsable={false} style={[styles.emojiCircle, { backgroundColor: glass }]}>
              <AppText style={styles.heroEmoji}>{shown.emoji}</AppText>
            </View>
          </PopIn>
          <View style={styles.letters}>
            {letters.map((letter, i) => (
              <PopIn key={i} delay={T.letter + i * T.letterGap} from={0.1} style={[styles.letterTile, { backgroundColor: glass }]}>
                <AppText style={[styles.letter, { color: ink }]}>{letter}</AppText>
                <AppText style={styles.letterLabel} color={inkSoft} numberOfLines={1}>
                  {kktiCopy.pole(result.axes[i].key, kktiCopy.sideOf(result.axes[i])).label}
                </AppText>
              </PopIn>
            ))}
          </View>
          <PopIn delay={T.name}>
            <AppText variant="display" align="center" color={ink} style={nameSize}>
              {shown.name}
            </AppText>
          </PopIn>
          <FadeUp delay={T.name + 80}>
            <AppText variant="body" align="center" color={inkSoft}>
              {shown.oneLiner}
            </AppText>
          </FadeUp>
          <FadeUp delay={T.name + 160} style={styles.heroChips}>
            {[colorText.name, mbti.type, ennea.title].map((chip) => (
              <View key={chip} style={[styles.heroChip, { backgroundColor: glass }]}>
                <AppText variant="caption" weight="700" color={ink}>
                  {chip}
                </AppText>
              </View>
            ))}
          </FadeUp>
          <FadeUp delay={T.name + 240}>
            <AppText variant="caption" align="center" color={inkSoft}>
              {L('KKTI · 카톡으로 보는 진짜 연애 MBTI', 'Texting Type Test · What your texts say about you')}
            </AppText>
          </FadeUp>
        </View>

        {/* 둘의 궁합 — 둘 다 테스트를 끝내야 나온다 */}
        {hydrated && match && partner ? <MatchSection match={match} left={result} right={partner} role={role} delay={T.rest} /> : null}

        {/* 친구가 보낸 링크로 들어왔을 때 — 이 화면의 파란 버튼 */}
        {hydrated && role === 'guest' ? (
          <FadeUp delay={T.rest + 30} style={[styles.box, { backgroundColor: fill }]}>
            <AppText variant="title3">
              {partner
                ? L('두 사람의 궁합 결과예요', "Here's how these two match")
                : savedCode
                  ? L('친구가 보낸 결과네요!', 'Your friend sent you their result!')
                  : L('친구가 보낸 결과인가요?', 'Did a friend send you this?')}
            </AppText>
            <AppText variant="small" color="textSecondary">
              {savedCode
                ? L(`내 결과와 「${type.name}」${josa(type.name, '이', '가')} 얼마나 맞는지 바로 볼 수 있어요.`, `See how your result matches with ${shown.name} right now.`)
                : partner
                  ? L(
                      `나도 테스트하면 「${type.name}」${josa(type.name, '과', '와')}의 궁합을 볼 수 있어요. 12문항, 1분이면 돼요.`,
                      `Take the test to see your match with ${shown.name}. 12 questions, 1 minute.`,
                    )
                  : L('테스트를 끝내면 둘의 카톡 궁합이 나와요. 12문항, 1분이면 돼요.', 'Finish the test to see how your texting styles match. 12 questions, 1 minute.')}
            </AppText>
            {savedCode ? (
              <GradientButton title={L('내 결과와 궁합 보기', 'Match with my result')} size="md" onPress={matchWithSaved} haptic={false} />
            ) : (
              <GradientButton title={L('나도 테스트하고 궁합 보기', 'Take it & see your match')} size="md" onPress={retake} haptic={false} />
            )}
          </FadeUp>
        ) : null}
        {hydrated && role === 'partner' ? (
          <FadeUp delay={T.rest + 30} style={[styles.box, { backgroundColor: fill }]}>
            <AppText variant="title3">{L('친구가 테스트를 끝냈어요!', 'Your friend finished the test!')}</AppText>
            <AppText variant="small" color="textSecondary">
              {L('위는 친구의 결과예요. 내 결과 화면에서도 같은 궁합을 볼 수 있어요.', "That's your friend's result above. You'll see the same match on your own result too.")}
            </AppText>
            <GradientButton title={L('내 결과 보기', 'See my result')} size="md" haptic={false} onPress={seeMine} />
          </FadeUp>
        ) : null}

        {/* 공유 — 내 결과가 있는 사람만. 친구 결과를 보는 사람은 먼저 테스트를 하거나 저장된 내 결과로 넘어간다 */}
        {role !== 'guest' ? (
          <FadeUp delay={T.rest + 60} style={styles.share}>
            <GradientButton
              title={sharingMatch ? L('궁합 결과 보내기', 'Send our match') : L('친구에게 보내고 궁합 보기', 'Send to a friend & match')}
              accessibilityLabel={
                sharingMatch
                  ? L('궁합 결과 보내기, 카톡 등', 'Send our match, via texts and more')
                  : L('친구에게 보내고 궁합 보기, 카톡 등', 'Send to a friend and see your match, via texts and more')
              }
              haptic={false}
              onPress={shareSystem}
              icon={<Ionicons name="share-outline" size={18} color={Brand.onBrand} />}
            />
            <View style={styles.shareRow}>
              <ShareTile icon="image-outline" label={L('그림 저장', 'Save image')} sub={L('스토리용', 'For stories')} onPress={saveImage} />
              <ShareTile icon="link-outline" label={L('링크 복사', 'Copy link')} sub={L('인스타·틱톡', 'IG · TikTok')} onPress={copyLink} />
              <ShareTile icon="logo-x" label="X" sub={L('포스트', 'Post')} onPress={() => openIntent('x')} />
              <ShareTile icon="logo-threads" label={L('스레드', 'Threads')} sub={L('포스트', 'Post')} onPress={() => openIntent('threads')} />
            </View>
            <AppText variant="caption" color="textSecondary" align="center">
              {sharingMatch
                ? L(
                    '링크를 받은 사람도 같은 궁합 화면을 봐요. 다른 친구가 테스트하면 그 친구와의 궁합도 나와요.',
                    'Whoever opens the link sees the same match. If another friend takes the test, you get your match with them too.',
                  )
                : L('링크를 받은 친구가 테스트를 끝내면 둘의 궁합이 나와요.', 'When your friend finishes the test, you both see your match.')}
            </AppText>
          </FadeUp>
        ) : null}

        {/* 코치 한마디 → 앱 코칭 (예전엔 아홉 번째 카드였다 — 유형 카드 가까이로 올렸다) */}
        <FadeUp delay={T.rest + 90} style={[styles.box, { backgroundColor: fill }]}>
          <AppText variant="caption" color="textSecondary" weight="600">
            {L(`${APP_NAME} 코치 한마디`, 'A tip from My Love Coach')}
          </AppText>
          <AppText variant="bodyStrong">{shown.coachTip}</AppText>
          <AppText variant="small" color="textSecondary">
            {L(`추천 답장 톤 · ${tone.label} · ${tone.description}`, `Suggested reply tone · ${tone.label} · ${tone.description}`)}
          </AppText>
          <PressableScale
            feedback="thud"
            pressedScale={0.98}
            onPress={goCoach}
            accessibilityLabel={L('이 유형에 맞춘 답장 코칭 받기', 'Get reply coaching for your type')}
            style={[styles.coachBtn, { backgroundColor: theme.text }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.background} />
            <AppText variant="bodyStrong" color={theme.background}>
              {L('이 유형에 맞춘 답장 코칭 받기', 'Get reply coaching for your type')}
            </AppText>
          </PressableScale>
          {onIosWeb() ? (
            <Button
              title={L('아이폰 앱으로 받기 (App Store)', 'Get the iPhone app (App Store)')}
              variant="ghost"
              haptic={false}
              onPress={openStore}
              icon={<Ionicons name="logo-apple" size={18} color={theme.textSecondary} />}
            />
          ) : null}
          <AppText variant="caption" color="textSecondary" align="center">
            {L('캡처 한 장이면 답장 3개와 호감 온도까지', 'One screenshot = 3 reply ideas + their interest level')}
          </AppText>
        </FadeUp>

        {/* 유형 설명 — 펼쳐 둔다. 강점·조심은 색 대신 검정 글자 + 기호 */}
        <FadeUp delay={T.rest + 120} style={styles.about}>
          <AppText variant="title3" accessibilityRole="header">
            {L(`${type.name}${josa(type.name, '은', '는')} 이런 사람`, `${shown.name}, explained`)}
          </AppText>
          <AppText variant="body">{shown.description}</AppText>
          <View style={styles.list}>
            <AppText variant="smallStrong" color="textSecondary">
              {L('강점', 'Strengths')}
            </AppText>
            {shown.strengths.map((s) => (
              <Bullet key={s} icon="checkmark" text={s} />
            ))}
          </View>
          <View style={styles.list}>
            <AppText variant="smallStrong" color="textSecondary">
              {L('이건 조심', 'Watch out for')}
            </AppText>
            {shown.watchOut.map((s) => (
              <Bullet key={s} icon="alert-circle-outline" text={s} />
            ))}
          </View>
        </FadeUp>

        {/* 더 보기 — 줄로 접어 두고 누르면 펼친다 */}
        <FadeUp delay={T.rest + 160} style={styles.folds}>
          <Fold title={L('나의 카톡 습관', 'My texting habits')} value={letters.join('')}>
            {result.axes.map((axis, i) => (
              <AxisBar key={axis.key} axis={axis} fill={barFill} track={fill} delay={80 + i * 90} />
            ))}
          </Fold>

          <Fold title={L('카톡 속 진짜 MBTI', 'My texting MBTI')} value={mbti.type}>
            <View style={styles.mbtiRow}>
              {mbti.letters.map((l, i) => (
                <View key={l.letter} style={[styles.mbtiCell, { backgroundColor: fill }]}>
                  <AppText style={[styles.mbtiLetter, { color: theme.text }]}>{l.letter}</AppText>
                  <AppText variant="caption" color="textSecondary">
                    {/* l.from 은 같은 자리의 유형 코드 글자 — 화면용 글자(영어판은 영어 글자)로 */}
                    {letters[i] ?? l.from} · {l.confidence}%
                  </AppText>
                </View>
              ))}
            </View>
            <AppText variant="small" color="textSecondary">
              {L(
                `카톡 습관만으로 본 MBTI예요 (평균 확신도 ${mbti.confidence}%). 평소 MBTI랑 다르다면… 카톡 속 내가 진짜일지도?`,
                `Your MBTI based only on how you text (avg. confidence ${mbti.confidence}%). Different from your usual MBTI? Maybe texting-you is the real you…`,
              )}
            </AppText>
            <AppText variant="caption" color="textSecondary">
              {L('공식 MBTI 검사와는 관계없는 재미용 테스트예요.', 'Just for fun. Not affiliated with the official MBTI assessment.')}
            </AppText>
          </Fold>

          <Fold title={L('애니어그램 추정', 'Enneagram guess')} value={ennea.short}>
            <View style={styles.enneaRow}>
              <View style={[styles.enneaBadge, { backgroundColor: fill }]}>
                <AppText style={[styles.enneaNumber, { color: theme.text }]}>{enneagram.number}</AppText>
              </View>
              <View style={styles.flexShrink}>
                <AppText variant="bodyStrong">{ennea.title}</AppText>
                <AppText variant="small" color="textSecondary">
                  {ennea.reason}
                </AppText>
              </View>
            </View>
            <AppText variant="caption" color="textSecondary">
              {ennea.note}
            </AppText>
          </Fold>

          <Fold title={L('나만의 연애 컬러', 'My love color')} value={colorText.name} swatch={color.hex}>
            <PressableScale
              feedback={false}
              onPress={() => copy(color.hex, L(`색상 코드 ${color.hex} 복사했어요`, `Copied color code ${color.hex}`), 'hex')}
              accessibilityLabel={L(`색상 코드 ${color.hex} 복사`, `Copy color code ${color.hex}`)}
              style={[styles.swatch, { backgroundColor: color.hex }]}>
              <AppText variant="title2" color={ink}>
                {colorText.name}
              </AppText>
              <View style={styles.swatchFoot}>
                <AppText variant="smallStrong" color={inkSoft}>
                  {color.hex}
                </AppText>
                <View style={[styles.copyChip, { backgroundColor: glass }]}>
                  <Ionicons name="copy-outline" size={12} color={ink} />
                  <AppText variant="caption" weight="700" color={ink}>
                    {L('복사', 'Copy')}
                  </AppText>
                </View>
              </View>
            </PressableScale>
            <AppText variant="body">{colorText.description}</AppText>
            <View style={styles.metaRow}>
              {[
                { label: L('색상', 'Hue'), value: `${color.hsl.h}°` },
                { label: L('채도', 'Saturation'), value: `${color.hsl.s}%` },
                { label: L('명도', 'Lightness'), value: `${color.hsl.l}%` },
              ].map((m) => (
                <View key={m.label} style={[styles.meta, { backgroundColor: fill }]}>
                  <AppText variant="caption" color="textSecondary">
                    {m.label}
                  </AppText>
                  <AppText variant="smallStrong">{m.value}</AppText>
                </View>
              ))}
            </View>
            <AppText variant="caption" color="textSecondary">
              {L('답 조합마다 색이 미묘하게 달라요. 560만 가지가 넘는 색 중 나만의 색이에요.', 'Every answer combo gets a slightly different shade. This one of 5.6M+ colors is all yours.')}
            </AppText>
          </Fold>

          <Fold title={L('연애 궁합', 'Compatibility')} value={best ? L(`찰떡 ${best.name}`, `Best: ${bestShown?.name ?? best.name}`) : undefined} last>
            {best ? (
              <MatchRow
                label={L('찰떡궁합', 'Perfect match')}
                emoji={best.emoji}
                name={bestShown?.name ?? best.name}
                code={bestShown?.code ?? best.code}
                reason={kktiCopy.reason(result.code, best.code)}
                fill={fill}
              />
            ) : null}
            {worst ? (
              <MatchRow
                label={L('상극 주의', 'Proceed with caution')}
                emoji={worst.emoji}
                name={worstShown?.name ?? worst.name}
                code={worstShown?.code ?? worst.code}
                reason={kktiCopy.reason(result.code, worst.code)}
                fill={fill}
              />
            ) : null}
          </Fold>
        </FadeUp>

        <View style={styles.actions}>
          {mine ? (
            <View style={styles.savedRow}>
              <Ionicons name="checkmark-circle" size={18} color={theme.textSecondary} />
              <AppText variant="smallStrong" color="textSecondary">
                {L('내 프로필에 저장됨', 'Saved to your profile')}
              </AppText>
            </View>
          ) : hydrated && role === 'guest' && !partner && !saved ? (
            // 웹에서 끝낸 내 결과 링크를 앱에서 열었을 때 프로필에 담는 용도. 이미 내 결과가 있으면 숨긴다 (친구 답으로 덮어쓰지 않게)
            <Button title={L('내 프로필에 저장', 'Save to my profile')} variant="ghost" haptic={false} onPress={save} icon={<Ionicons name="bookmark-outline" size={18} color={theme.textSecondary} />} />
          ) : null}
          {role === 'guest' ? null : <Button title={L('다시 하기', 'Retake')} variant="ghost" haptic={false} onPress={retake} />}
        </View>
      </ScrollView>
      <StatusBarScrim height={insets.top} color={theme.background} visible={scrolled} />
    </View>
  );
}

// ───────────────────────── 조각들 ─────────────────────────

/** 접어 둔 줄 — 제목 · 오른쪽 값 · ›. 누르면 아래로 내용을 펼친다(흰 바탕 위 줄, 가는 선으로 나눈다) */
function Fold({ title, value, swatch, last, children }: PropsWithChildren<{ title: string; value?: string; swatch?: string; last?: boolean }>) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.fold, { borderTopColor: theme.separator }, last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.separator }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={value ? `${title}, ${value}` : title}
        onPress={() => {
          haptic.select();
          setOpen((v) => !v);
        }}
        style={styles.foldHead}>
        <AppText variant="bodyStrong" style={styles.flexShrink}>
          {title}
        </AppText>
        <View style={styles.foldRight}>
          {swatch ? <View style={[styles.foldSwatch, { backgroundColor: swatch }]} /> : null}
          {value ? (
            <AppText variant="small" color="textSecondary" numberOfLines={1} style={styles.flexShrink}>
              {value}
            </AppText>
          ) : null}
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textTertiary} />
        </View>
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.foldBody}>
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

function Bullet({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.bullet}>
      <Ionicons name={icon} size={16} color={theme.textSecondary} style={styles.bulletIcon} />
      <AppText variant="small" style={styles.flexShrink}>
        {text}
      </AppText>
    </View>
  );
}

/** 공유 칸 — 회색 동그라미 + 검정 선 아이콘(예전엔 칸마다 색이 달랐다) */
function ShareTile({ icon, label, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; onPress: () => void }) {
  const theme = useTheme();
  const fill = useColorScheme() === 'dark' ? theme.surfaceElevated : theme.surface;
  return (
    <PressableScale feedback={false} onPress={onPress} accessibilityLabel={L(`${label} ${sub}로 공유`, `Share: ${label} (${sub})`)} style={styles.shareTile}>
      <View style={[styles.shareIcon, { backgroundColor: fill }]}>
        <Ionicons name={icon} size={21} color={theme.text} />
      </View>
      <AppText variant="caption" weight="600" align="center" numberOfLines={1}>
        {label}
      </AppText>
      <AppText variant="caption" color="textSecondary" align="center" numberOfLines={1}>
        {sub}
      </AppText>
    </PressableScale>
  );
}

/** 궁합 숫자가 차오르는 시간 */
const COUNT_MS = 900;

/** 0 에서 목표 숫자까지 빠르게 올라가다 천천히 멈춘다 */
function useCountUp(target: number, delay: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame: ReturnType<typeof setTimeout> | null = null;
    const start = setTimeout(() => {
      const startedAt = Date.now();
      const tick = () => {
        const t = Math.min(1, (Date.now() - startedAt) / COUNT_MS);
        setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = setTimeout(tick, 33);
      };
      tick();
    }, delay);
    return () => {
      clearTimeout(start);
      if (frame) clearTimeout(frame);
    };
  }, [target, delay]);
  return value;
}

/** 둘의 궁합 — 숫자가 차오르고, 잘 맞으면 하트가 터진다. 누가 봐도 같은 내용이라 둘이 같은 화면을 보게 된다 */
function MatchSection({ match, left, right, role, delay }: { match: KktiMatch; left: KktiResult; right: KktiResult; role: Role; delay: number }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const fill = dark ? theme.surfaceElevated : theme.surface;
  const inner = dark ? theme.border : theme.card;
  const celebrate = useCelebrate();
  const shown = useCountUp(match.percent, delay + 300);
  const copy = kktiCopy.match(match);

  useEffect(() => {
    const begin = setTimeout(() => haptic.rise(), delay + 300);
    const done = setTimeout(
      () => {
        haptic.thud();
        if (match.percent >= 78) celebrate({ kind: 'hearts', count: 14, haptic: false });
      },
      delay + 300 + COUNT_MS,
    );
    return () => {
      clearTimeout(begin);
      clearTimeout(done);
    };
  }, [celebrate, delay, match.percent]);

  const me = L('나', 'Me');
  const friend = L('친구', 'Friend');
  const leftLabel = role === 'mine' ? me : role === 'partner' ? friend : null;
  const rightLabel = role === 'mine' ? friend : role === 'partner' ? me : null;

  return (
    <FadeUp delay={delay} style={[styles.box, styles.matchSection, { backgroundColor: fill }]}>
      <AppText variant="title3" align="center" accessibilityRole="header">
        {role === 'guest' ? L('둘의 카톡 궁합', 'Their texting compatibility') : L('우리 카톡 궁합', 'Our texting compatibility')}
      </AppText>
      <View style={styles.matchPeople}>
        <MatchPerson result={left} label={leftLabel} />
        <AppText variant="title2" color="textTertiary" style={styles.matchTimes}>
          ×
        </AppText>
        <MatchPerson result={right} label={rightLabel} />
      </View>
      <View
        style={styles.matchPercentRow}
        accessible
        accessibilityLabel={L(`궁합 ${match.percent}퍼센트, ${match.tier.label}`, `${match.percent} percent match, ${copy.tier.label}`)}>
        <AppText style={[styles.matchPercent, { color: theme.primary }]}>{shown}</AppText>
        <AppText style={[styles.matchPercentSign, { color: theme.primary }]}>%</AppText>
      </View>
      <View style={[styles.matchTier, { backgroundColor: inner }]}>
        <AppText variant="bodyStrong">{copy.tier.label}</AppText>
      </View>
      <AppText variant="body" color="textSecondary" align="center">
        {copy.tier.line}
      </AppText>
      <View style={styles.matchAxes}>
        {copy.axes.map((axis) => (
          <MatchAxisRow key={axis.key} axis={axis} fill={inner} />
        ))}
      </View>
      <View style={[styles.quote, { borderLeftColor: theme.border }]}>
        <AppText variant="body">{copy.tip}</AppText>
      </View>
      <AppText variant="caption" color="textSecondary" align="center">
        {L('카톡 습관 12문항으로 본 재미용 궁합이에요', 'A just-for-fun match based on 12 texting-habit questions')}
      </AppText>
    </FadeUp>
  );
}

function MatchPerson({ result, label }: { result: KktiResult; label: string | null }) {
  const theme = useTheme();
  const inner = useColorScheme() === 'dark' ? theme.border : theme.card;
  const shown = kktiCopy.type(result.code);
  return (
    <View style={styles.matchPerson}>
      <View style={[styles.matchCircle, { backgroundColor: mixHex(result.color.hex, '#FFFFFF', 0.45), borderColor: result.color.hex }]}>
        <AppText style={styles.matchPersonEmoji}>{result.type.emoji}</AppText>
      </View>
      {label ? (
        <View style={[styles.matchWho, { backgroundColor: inner }]}>
          <AppText variant="caption" weight="700" color="textSecondary">
            {label}
          </AppText>
        </View>
      ) : null}
      <AppText variant="smallStrong" align="center" numberOfLines={2}>
        {shown?.name ?? result.type.name}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {shown?.code ?? result.code}
      </AppText>
    </View>
  );
}

function MatchAxisRow({ axis, fill }: { axis: KktiMatchCopy['axes'][number]; fill: string }) {
  return (
    <View style={[styles.matchAxisRow, { backgroundColor: fill }]}>
      <View style={styles.matchAxisBody}>
        <View style={styles.matchAxisHead}>
          <AppText variant="smallStrong">{axis.label}</AppText>
          <AppText variant="caption" weight="600" color="textSecondary">
            {axis.fitLabel}
          </AppText>
        </View>
        <AppText variant="small" color="textSecondary">
          {axis.line}
        </AppText>
      </View>
    </View>
  );
}

/** 축 하나 — 고른 쪽에서부터 막대가 차오른다 */
function AxisBar({ axis, fill, track, delay }: { axis: KktiAxisResult; fill: string; track: string; delay: number }) {
  const plusSide = axis.pole.letter === axis.plus.letter;
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withTiming(axis.percent / 100, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [axis.percent, delay, v]);
  const barStyle = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }));
  const plus = kktiCopy.pole(axis.key, 'plus');
  const minus = kktiCopy.pole(axis.key, 'minus');
  return (
    <View style={styles.axis}>
      <AppText variant="caption" color="textSecondary" weight="600">
        {kktiCopy.axisLabel(axis.key)}
      </AppText>
      <View style={styles.axisLabels}>
        <AppText variant={plusSide ? 'smallStrong' : 'small'} color={plusSide ? 'text' : 'textSecondary'} style={styles.flexShrink} numberOfLines={1}>
          {plus.letter} {plus.label} {axis.plusPercent}%
        </AppText>
        <AppText variant={plusSide ? 'small' : 'smallStrong'} color={plusSide ? 'textSecondary' : 'text'} style={styles.flexShrink} numberOfLines={1} align="right">
          {minus.letter} {minus.label} {100 - axis.plusPercent}%
        </AppText>
      </View>
      <View style={[styles.axisTrack, { backgroundColor: track, alignItems: plusSide ? 'flex-start' : 'flex-end' }]}>
        <Animated.View style={[styles.axisFill, { backgroundColor: fill }, barStyle]} />
      </View>
    </View>
  );
}

function MatchRow({ label, emoji, name, code, reason, fill }: { label: string; emoji: string; name: string; code: string; reason: string; fill: string }) {
  return (
    <View style={[styles.matchRow, { backgroundColor: fill }]}>
      <AppText style={styles.matchEmoji}>{emoji}</AppText>
      <View style={styles.flexShrink}>
        <AppText variant="caption" weight="600" color="textSecondary">
          {label}
        </AppText>
        <AppText variant="bodyStrong">
          {name}{' '}
          <AppText variant="small" color="textSecondary">
            {code}
          </AppText>
        </AppText>
        <AppText variant="small" color="textSecondary">
          {reason}
        </AppText>
      </View>
    </View>
  );
}

/** 작게 시작해 통통 튀며 나타난다 */
function PopIn({ delay = 0, from = 0.6, style, children }: PropsWithChildren<{ delay?: number; from?: number; style?: StyleProp<ViewStyle> }>) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withSpring(1, { damping: 14, stiffness: 200, mass: 0.8 }));
  }, [delay, v]);
  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, v.value * 1.6)),
    transform: [{ scale: from + (1 - from) * v.value }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** 아래에서 살짝 떠오르며 나타난다 */
function FadeUp({ delay = 0, style, children }: PropsWithChildren<{ delay?: number; style?: StyleProp<ViewStyle> }>) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }));
  }, [delay, v]);
  const animated = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 18 }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

const HERO_FLOOD = 1400;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  clip: { overflow: 'hidden' },
  content: { paddingHorizontal: Spacing.lg, gap: Spacing.md, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, height: 40, borderRadius: Radius.pill },

  hero: { borderRadius: 24, overflow: 'hidden', paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.lg, alignItems: 'center', gap: Spacing.md },
  heroFlood: {
    position: 'absolute',
    width: HERO_FLOOD,
    height: HERO_FLOOD,
    borderRadius: HERO_FLOOD / 2,
    left: '50%',
    marginLeft: -HERO_FLOOD / 2,
    top: 104 - HERO_FLOOD / 2,
  },
  emojiCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  heroEmoji: { fontSize: 52, lineHeight: 64 },
  letters: { flexDirection: 'row', gap: 6, alignSelf: 'stretch', justifyContent: 'center' },
  letterTile: { flex: 1, maxWidth: 84, borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: 2, alignItems: 'center' },
  letter: { fontSize: 30, lineHeight: 38, fontWeight: '700' },
  letterLabel: { fontSize: 12, lineHeight: 15, fontWeight: '600' },
  heroNameLong: { fontSize: 26, lineHeight: 34 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  heroChip: { paddingHorizontal: Spacing.sm + 2, paddingVertical: 4, borderRadius: Radius.pill },

  // 회색 면 한 장(테두리·그림자 없이)
  box: { borderRadius: 24, padding: Spacing.lg + 2, gap: Spacing.md },
  matchSection: { gap: Spacing.md },
  share: { gap: Spacing.md, paddingTop: Spacing.xs },
  coachBtn: { height: 50, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  about: { gap: Spacing.md, paddingHorizontal: 2, marginTop: Spacing.md },
  folds: { marginTop: Spacing.sm },
  fold: { borderTopWidth: StyleSheet.hairlineWidth },
  foldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, minHeight: 56, paddingHorizontal: 2 },
  foldRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  foldSwatch: { width: 14, height: 14, borderRadius: 7 },
  foldBody: { gap: Spacing.md, paddingBottom: Spacing.lg, paddingHorizontal: 2 },
  matchPeople: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: Spacing.sm },
  matchTimes: { marginTop: 22 },
  matchPerson: { flex: 1, maxWidth: 150, alignItems: 'center', gap: 4 },
  matchCircle: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  matchPersonEmoji: { fontSize: 38, lineHeight: 48 },
  matchWho: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill },
  matchPercentRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  // 이 묶음의 큰 숫자는 궁합 하나
  matchPercent: { fontSize: 56, lineHeight: 64, fontWeight: '700', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  matchPercentSign: { fontSize: 26, lineHeight: 44, fontWeight: '700', marginLeft: 2 },
  matchTier: { alignSelf: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs + 2, borderRadius: Radius.pill },
  matchAxes: { gap: Spacing.sm },
  matchAxisRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: 16, padding: Spacing.md },
  matchAxisBody: { flex: 1, gap: 2 },
  matchAxisHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  list: { gap: Spacing.xs + 2 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  bulletIcon: { marginTop: 2 },

  shareRow: { flexDirection: 'row', gap: Spacing.sm },
  shareTile: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: Spacing.xs },
  shareIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },

  axis: { gap: 6 },
  axisLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  axisTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  axisFill: { height: '100%', borderRadius: 4 },

  mbtiRow: { flexDirection: 'row', gap: Spacing.sm },
  mbtiCell: { flex: 1, alignItems: 'center', borderRadius: 16, paddingVertical: Spacing.md, gap: 2 },
  mbtiLetter: { fontSize: 26, lineHeight: 32, fontWeight: '700' },

  enneaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  enneaBadge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  enneaNumber: { fontSize: 28, lineHeight: 34, fontWeight: '700' },

  swatch: { height: 120, borderRadius: 20, padding: Spacing.lg, justifyContent: 'space-between' },
  swatchFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  copyChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.pill },
  metaRow: { flexDirection: 'row', gap: Spacing.sm },
  meta: { flex: 1, borderRadius: 14, paddingVertical: Spacing.sm, alignItems: 'center' },

  matchRow: { flexDirection: 'row', gap: Spacing.md, borderRadius: 16, padding: Spacing.md, alignItems: 'flex-start' },
  matchEmoji: { fontSize: 30, lineHeight: 38 },

  quote: { borderLeftWidth: 3, paddingLeft: Spacing.md, paddingVertical: 2 },
  actions: { gap: Spacing.xs, marginTop: Spacing.sm },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48 },

  invalid: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  invalidInner: { width: '100%', maxWidth: 420, alignItems: 'center', gap: Spacing.md },
  invalidIcon: { marginBottom: Spacing.sm },
  invalidActions: { alignSelf: 'stretch', gap: Spacing.sm, marginTop: Spacing.md },
});
