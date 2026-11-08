import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type Ref } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { GlassSurface } from '@/components/ui/glass-surface';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Brand, Radius, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useKeyboardVisible } from '@/hooks/use-keyboard';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import type { PickedImage } from '@/lib/images';
import { TONES } from '@/lib/labels';
import type { EmojiPref, Tone } from '@/lib/types';

interface ComposerProps {
  tone: Tone;
  onToneChange: (tone: Tone) => void;
  /** 답장에 이모지 넣기 */
  emoji: EmojiPref;
  onEmojiChange: (emoji: EmojiPref) => void;
  image: PickedImage | null;
  onPickImage: () => void;
  onClearImage: () => void;
  /** false 를 돌려주면 보내지 않은 것으로 보고 입력한 글을 그대로 둔다 */
  onSend: (text: string) => boolean | void;
  sending?: boolean;
  /** 입력창 위에 보여 줄 안내 (무료 횟수 등) */
  notice?: { text: string; actionLabel?: string; onAction?: () => void; emphasized?: boolean } | null;
  /** 입력창이 비었을 때 띄울 무작위 질문들 (누르면 바로 물어본다) */
  questions?: string[];
  onQuestion?: (question: string) => void;
  onShuffleQuestions?: () => void;
  /** 밖에서 입력창 글을 바꿀 때 (key 가 바뀔 때마다 text 로 채움) — 막혔던 글을 살리거나, 이어 보낸 뒤 비울 때 */
  fill?: { text: string; key: number } | null;
  /** 이용자가 입력창 글을 고칠 때 (막혔던 예전 요청을 잊게) */
  onEdit?: () => void;
  /** 들어오자마자 입력창에 커서를 둔다 (홈의 「상황만 적기」) */
  autoFocus?: boolean;
}

const EMOJI_NEXT: Record<EmojiPref, EmojiPref> = { on: 'off', off: 'auto', auto: 'on' };
const EMOJI_LABEL: Record<EmojiPref, string> = { on: '😊 이모지 넣기', off: '🚫 이모지 빼기', auto: '🪞 이모지 자동' };

/** 떠 있는 유리 알약 — 한 줄일 때 높이 (모서리는 이 높이의 절반) */
export const PILL_HEIGHT = 52;
/** 알약 안쪽 여백 (보내기 구슬이 알약 가장자리에서 떨어진 거리) */
const PILL_PAD = 6;
/** 보내기 구슬 */
const ORB = PILL_HEIGHT - PILL_PAD * 2;
/** 캡처 버튼 */
const CAPTURE = 36;
/** 화면 양옆 */
export const COMPOSER_SIDE = Spacing.md;
/** 입력창 위로 메시지가 사라지는 흐림 높이 */
export const COMPOSER_FADE = 28;
/** 글 입력칸 — 한 줄 높이(위아래 여백 포함)와 최대 높이 */
const INPUT_MIN = ORB;
const INPUT_MAX = 132;

/** 탭 바의 「새 채팅」 구슬과 같은 색 — 보내기 구슬이 보낼 수 있을 때 차오른다 */
export const ORB_GRADIENT = Brand.orb;
const ORB_GLOSS = ['rgba(255,255,255,0.42)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'] as const;

const isWeb = Platform.OS === 'web';
/** 웹 브라우저는 여러 줄 입력칸을 기본 두 줄로 그린다 — 한 줄로 시작해 글이 늘면 키운다 (앱은 저절로 자란다) */
const WEB_ONE_ROW = (isWeb ? { rows: 1 } : {}) as object;

/**
 * 채팅 입력창 (1.2 개편 「떠 있는 유리」) — 탭 바처럼 화면 위에 떠 있는 유리 알약.
 * [캡처 버튼 | 여러 줄 글 입력 | 보내기 구슬]. 그 위에 질문 칩·말투 칩이 한 줄씩 가볍게 뜨고, 메시지는 입력창 뒤로 흐리게 사라진다.
 * 입력창은 레이아웃 흐름 안에 둔다 (KeyboardAvoidingView 계산이 그대로 맞게).
 */
export function Composer({ tone, onToneChange, emoji, onEmojiChange, image, onPickImage, onClearImage, onSend, sending, notice, questions, onQuestion, onShuffleQuestions, fill, onEdit, autoFocus }: ComposerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  // 들어오자마자 커서를 두되, 화면 전환·헤더 높이 측정(채팅방 250ms)이 끝난 뒤에 — 바로 올리면 키보드가 입력창을 덮을 수 있다
  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => inputRef.current?.focus(), 450);
    return () => clearTimeout(t);
  }, [autoFocus]);
  const fillKey = fill?.key;
  const fillText = fill?.text;
  useEffect(() => {
    if (fillKey != null) setText(fillText ?? '');
  }, [fillKey, fillText]);
  const sendScale = useSharedValue(1);
  const sendStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendScale.value }] }));
  // 키보드가 올라오면 홈 인디케이터 여백이 필요 없다 — 그대로 두면 키보드와 입력창 사이가 벌어진다
  const bottomPad = (keyboardVisible ? 0 : insets.bottom) + Spacing.sm;
  const canSend = !sending && (Boolean(image) || text.trim().length > 0);
  const showQuestions = Boolean(questions?.length) && !text && !image && !sending;

  const submit = () => {
    if (!canSend) return;
    if (onSend(text.trim()) === false) return;
    haptic.thud();
    sendScale.value = withSequence(withSpring(0.8, { damping: 10, stiffness: 400 }), withSpring(1, { damping: 8, stiffness: 260 }));
    setText('');
  };

  return (
    <View style={[styles.wrap, { paddingBottom: bottomPad }]}>
      <ComposerBackdrop />

      {notice ? (
        <Animated.View entering={FadeInDown.duration(200)}>
          <Pressable
            accessibilityRole={notice.onAction ? 'button' : 'text'}
            onPress={notice.onAction}
            disabled={!notice.onAction}
            style={({ pressed }) => [styles.notice, { backgroundColor: notice.emphasized ? theme.primarySoft : theme.surface, opacity: pressed ? 0.7 : 1 }]}>
            <AppText variant="caption" color={notice.emphasized ? 'text' : 'textSecondary'} weight={notice.emphasized ? '700' : '600'} style={styles.noticeText} numberOfLines={2}>
              {notice.text}
            </AppText>
            {notice.actionLabel ? (
              <AppText variant="caption" color="primary" weight="800">
                {notice.actionLabel} ›
              </AppText>
            ) : null}
          </Pressable>
        </Animated.View>
      ) : null}

      {/* 「그 사람은 지금 무슨 생각일까?」 같은 질문을 무작위로 띄워 바로 물어보게 한다 */}
      {showQuestions ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll} contentContainerStyle={styles.rowContent} keyboardShouldPersistTaps="handled">
          {onShuffleQuestions ? (
            <PressableScale
              accessibilityLabel="다른 질문 보기"
              feedback="select"
              pressedScale={0.88}
              onPress={onShuffleQuestions}
              hitSlop={6}
              style={[styles.dice, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name="shuffle" size={15} color={theme.primary} />
            </PressableScale>
          ) : null}
          {questions!.map((q) => (
            <Animated.View key={q} entering={FadeIn.duration(240)}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  haptic.tap();
                  onQuestion?.(q);
                }}
                // 칩은 32 높이로 가볍게, 누르는 곳은 위아래로 넓혀 44
                hitSlop={{ top: 6, bottom: 6 }}
                style={({ pressed }) => [styles.question, { backgroundColor: pressed ? theme.surface : theme.background, borderColor: theme.border }]}>
                <AppText variant="caption" color="text" weight="600" style={styles.questionText}>
                  {q}
                </AppText>
              </Pressable>
            </Animated.View>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll} contentContainerStyle={styles.rowContent} keyboardShouldPersistTaps="handled">
        <Chip label={EMOJI_LABEL[emoji]} selected={emoji !== 'off'} tone="accent" size="sm" onPress={() => onEmojiChange(EMOJI_NEXT[emoji])} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        {TONES.map((t) => (
          <Chip key={t.key} label={t.label} emoji={t.emoji} selected={tone === t.key} onPress={() => onToneChange(t.key)} size="sm" />
        ))}
      </ScrollView>

      {/* 첨부한 캡처 — 유리 알약 위 작은 카드 */}
      {image ? (
        <Animated.View entering={FadeInDown.springify().damping(16)} style={styles.previewWrap}>
          <GlassSurface radius={18} floating={false} style={styles.preview}>
            <Image source={{ uri: image.uri }} style={[styles.previewImage, { backgroundColor: theme.surface }]} contentFit="cover" />
            <View style={styles.previewTexts}>
              <AppText variant="smallStrong">캡처 1장 첨부됨</AppText>
              <AppText variant="caption" color="textSecondary">
                호칭과 말투도 같이 읽어요
              </AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="캡처 제거" onPress={onClearImage} hitSlop={8} style={({ pressed }) => [styles.previewClose, { backgroundColor: theme.surface, opacity: pressed ? 0.6 : 1 }]}>
              <Ionicons name="close" size={16} color={theme.textSecondary} />
            </Pressable>
          </GlassSurface>
        </Animated.View>
      ) : null}

      <GlassSurface radius={PILL_HEIGHT / 2} style={styles.pill}>
        <PressableScale
          accessibilityLabel="대화 캡처 올리기"
          accessibilityState={{ disabled: sending }}
          feedback="tap"
          pressedScale={0.88}
          onPress={onPickImage}
          disabled={sending}
          hitSlop={6}
          style={[styles.capture, { backgroundColor: theme.primarySoft, opacity: sending ? 0.5 : 1 }]}>
          <Ionicons name="image" size={18} color={theme.primary} />
        </PressableScale>
        <PillInput
          ref={inputRef}
          value={text}
          onChangeText={(value) => {
            setText(value);
            onEdit?.();
          }}
          placeholder={image ? '덧붙일 상황 (선택)' : '캡처나 상황을 보내 주세요'}
          maxLength={800}
          editable={!sending}
        />
        <Animated.View style={sendStyle}>
          <SendOrb active={canSend} onPress={submit} accessibilityLabel="코치에게 보내기" />
        </Animated.View>
      </GlassSurface>
    </View>
  );
}

/**
 * 유리 알약 안의 여러 줄 글 입력칸 — 한 줄일 때 보내기 구슬과 같은 높이, 글이 늘면 최대 INPUT_MAX 까지 자란다.
 * 웹은 브라우저가 입력칸을 기본 두 줄로 그리고 저절로 자라지 않아, 한 줄로 시작해 글 높이만큼 직접 키운다.
 */
export function PillInput({ ref, style, value, onContentSizeChange, ...rest }: TextInputProps & { ref?: Ref<TextInput> }) {
  const theme = useTheme();
  const [webHeight, setWebHeight] = useState<number | null>(null);
  // 웹: 글을 비우면 다시 한 줄로 (브라우저는 한 번 커진 높이를 스스로 줄이지 않는다)
  useEffect(() => {
    if (isWeb && !value) setWebHeight(null);
  }, [value]);
  return (
    <TextInput
      ref={ref}
      {...WEB_ONE_ROW}
      multiline
      placeholderTextColor={theme.textTertiary}
      {...rest}
      value={value}
      onContentSizeChange={
        isWeb
          ? (e) => {
              setWebHeight(e.nativeEvent.contentSize.height);
              onContentSizeChange?.(e);
            }
          : onContentSizeChange
      }
      style={[styles.input, Typography.body, styles.noOutline, isWeb && webHeight ? { height: Math.min(INPUT_MAX, Math.max(INPUT_MIN, webHeight)) } : null, { color: theme.text }, style]}
    />
  );
}

/**
 * 입력창 뒤 바탕 — 위로 갈수록 투명해져 메시지가 입력창 뒤로 자연스럽게 사라진다.
 * 입력창 바로 위(흐림 높이만큼) 목록을 살짝 덮는다. 누름은 그대로 아래 목록으로 간다.
 */
export function ComposerBackdrop() {
  const theme = useTheme();
  return (
    <View pointerEvents="none" style={styles.backdrop}>
      <LinearGradient colors={[`${theme.background}00`, `${theme.background}D9`, theme.background]} locations={[0, 0.55, 1]} style={styles.fade} />
      <View style={[styles.fill, { backgroundColor: theme.background }]} />
    </View>
  );
}

/**
 * 보내기 구슬 — 탭 바 「새 채팅」 구슬과 같은 그라데이션·광택·파란 그림자.
 * 보낼 수 있을 때만 가운데서 차오르며 작게 튀고, 아닐 때는 옅은 회색 원에 회색 화살표 (↑ 는 보내기 뜻이라 유지).
 */
export function SendOrb({ active, onPress, accessibilityLabel, size = ORB, style }: { active: boolean; onPress: () => void; accessibilityLabel: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const reduced = useReducedMotion();
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = reduced ? withTiming(active ? 1 : 0, { duration: 140 }) : withSpring(active ? 1 : 0, { damping: 11, stiffness: 330, mass: 0.7 });
  }, [active, reduced, on]);
  // 차오를 때 1 을 살짝 넘었다 돌아와 「톡」 튄다
  const fillStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, on.value * 1.4)), transform: [{ scale: 0.45 + 0.55 * on.value }] }));
  const round = { width: size, height: size, borderRadius: size / 2 };
  const icon = Math.round(size * 0.52);
  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !active }}
      feedback={false}
      pressedScale={0.9}
      onPress={onPress}
      disabled={!active}
      hitSlop={4}
      style={[styles.orb, round, style]}>
      <View style={[StyleSheet.absoluteFill, styles.center, round, { backgroundColor: dark ? theme.border : theme.surface }]}>
        <Ionicons name="arrow-up" size={icon} color={theme.textTertiary} />
      </View>
      {/* 차오르는 구슬 — 안드로이드는 그림자(elevation) 있는 칸이 형제 위에 그려지므로 흰 화살표도 이 안에 둔다 */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, round, styles.orbShadow, fillStyle]}>
        <LinearGradient colors={ORB_GRADIENT} start={{ x: 0.2, y: 0 }} end={{ x: 0.85, y: 1 }} style={[StyleSheet.absoluteFill, styles.center, round, styles.clip]}>
          <LinearGradient pointerEvents="none" colors={ORB_GLOSS} locations={[0, 0.45, 1]} style={styles.gloss} />
          <Ionicons name="arrow-up" size={icon} color={Brand.onBrand} />
        </LinearGradient>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: Spacing.xs, paddingHorizontal: COMPOSER_SIDE, gap: Spacing.sm },
  backdrop: { position: 'absolute', left: 0, right: 0, top: -COMPOSER_FADE, bottom: 0 },
  fade: { height: COMPOSER_FADE },
  fill: { flex: 1 },
  // 무료 횟수 안내 — 유리 알약 위 작은 알약 카드 (글이 길면 두 줄까지)
  notice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 6, minHeight: 30 },
  noticeText: { flex: 1 },
  // 가로로 넘기는 칩 줄은 화면 끝까지 — 칩이 여백에서 잘려 보이지 않고 화면 밖으로 흘러간다
  rowScroll: { flexGrow: 0, marginHorizontal: -COMPOSER_SIDE },
  rowContent: { gap: 6, paddingHorizontal: COMPOSER_SIDE, alignItems: 'center' },
  dice: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  question: { height: 32, justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth * 2 },
  questionText: { fontSize: 13, lineHeight: 18 },
  divider: { width: 1, height: 16, marginHorizontal: 2 },
  previewWrap: { alignSelf: 'flex-start' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 2, paddingLeft: 6, paddingRight: Spacing.sm, paddingVertical: 6 },
  previewImage: { width: 38, height: 50, borderRadius: 12 },
  previewTexts: { gap: 1, paddingRight: Spacing.xs },
  previewClose: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'flex-end', minHeight: PILL_HEIGHT, padding: PILL_PAD, gap: Spacing.xs },
  capture: { width: CAPTURE, height: CAPTURE, borderRadius: CAPTURE / 2, marginBottom: (ORB - CAPTURE) / 2, marginLeft: (ORB - CAPTURE) / 2, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: INPUT_MIN, maxHeight: INPUT_MAX, paddingVertical: (INPUT_MIN - 24) / 2, paddingHorizontal: Spacing.xs + 2 },
  // 웹: 검은 포커스 테두리 대신 알약 모양 그대로. 위치를 지정해 둬야 유리 바탕(절대 위치)보다 위에 그려진다
  // (브라우저는 위치 지정 없는 textarea 를 절대 위치 칸보다 먼저 그려, 글자가 흰 유리 밑에 깔려 흐려진다). 앱에는 영향 없음
  noOutline: Platform.select({ web: { outlineStyle: 'none', position: 'relative' }, default: {} }) as object,
  orb: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  clip: { overflow: 'hidden' },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '58%' },
  // 그림자는 감싸는 칸에 — 구슬(그라데이션)은 둥글게 자르느라 overflow 가 숨김이라 아이폰 그림자가 잘린다
  orbShadow: Platform.select({
    ios: { shadowColor: Brand.shadow, shadowOpacity: 0.42, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
    android: { elevation: 6, shadowColor: Brand.shadow, backgroundColor: Brand.blue },
    default: { boxShadow: '0 6px 16px rgba(61,79,232,0.40)' } as ViewStyle,
  }) as ViewStyle,
});
