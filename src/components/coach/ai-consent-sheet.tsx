import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Linking, Modal, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AI_PROVIDER_LABEL, setAiConsentPrompter, type AiRoute } from '@/lib/ai-consent';
import { APP_CONFIG } from '@/lib/config';

interface Ask {
  route: AiRoute;
  resolve: (agreed: boolean) => void;
}

/**
 * AI 분석 동의 시트 — 루트 레이아웃에 한 번만 둔다.
 * AI 요청이 동의를 기다리면(ensureAiConsent) 시트를 띄우고, 고른 답을 그 요청에 돌려준다.
 * 아이폰은 루트의 Modal 이 네이티브 모달(빠른 코칭·결제 등)이 떠 있거나 닫히는 중이면 뜨지 못해서 창 맨 위(FullWindowOverlay)에 띄우고,
 * 안드로이드·웹은 Modal 로 띄운다. 아이폰 쪽은 등장 애니메이션을 두지 않는다 — 애니메이션이 멈추면 보이지 않는 시트가 화면을 막을 수 있어서.
 */
export function AiConsentHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const current = useRef<Ask | null>(null);

  useEffect(() => {
    setAiConsentPrompter(
      (route) =>
        new Promise<boolean>((resolve) => {
          // 입력하다 보냈으면 키보드가 버튼을 가리지 않게 내린다
          Keyboard.dismiss();
          // ensureAiConsent 가 시트를 하나만 띄우지만, 혹시 겹치면 앞의 것은 동의 안 함으로 끝낸다
          current.current?.resolve(false);
          const next = { route, resolve };
          current.current = next;
          setAsk(next);
        }),
    );
    return () => {
      setAiConsentPrompter(null);
      // 시트가 사라져도 기다리던 요청이 멈춰 있지 않게 동의 안 함으로 끝낸다
      current.current?.resolve(false);
      current.current = null;
    };
  }, []);

  const answer = (agreed: boolean) => {
    const waiting = current.current;
    if (!waiting) return;
    current.current = null;
    setAsk(null);
    waiting.resolve(agreed);
  };

  if (!ask) return null;
  if (Platform.OS === 'ios') {
    return (
      <FullWindowOverlay>
        <ConsentSheet route={ask.route} onAnswer={answer} />
      </FullWindowOverlay>
    );
  }
  return (
    // 안드로이드 뒤로 가기·웹 Esc 는 동의 안 함
    <Modal visible transparent animationType="slide" onRequestClose={() => answer(false)}>
      <ConsentSheet route={ask.route} onAnswer={answer} />
    </Modal>
  );
}

interface ConsentRow {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  text: string;
}

/**
 * 시트 문구. 개인정보 처리방침(site/privacy.html 1·2번(국외 이전 표 포함)·4·5번)에 적힌 내용만 쓴다 — 처리방침을 고치면 여기도 같이 고칠 것.
 * 서버를 거치면 Google(Gemini), 개인 키면 그 키의 회사로 바로 간다. 둘 다 미국 등 해외 서버라 국외 이전이다.
 */
function consentCopy(route: AiRoute) {
  const { company, ai } = AI_PROVIDER_LABEL[route.provider];
  const relay = route.via === 'relay';
  const rows: ConsentRow[] = [
    {
      icon: 'images-outline',
      label: '보내는 내용',
      text: '대화 캡처 이미지, 입력한 대화·상황 글, 내 프로필·상대 정보(이름·성별·나이·MBTI·메모 등), 최근 코칭 기록이에요. 캡처 속 상대방의 이름과 메시지도 함께 가요.',
    },
    {
      icon: 'paper-plane-outline',
      label: '받는 곳',
      text: relay
        ? 'Google LLC의 Gemini API예요. AI 기능을 쓸 때마다 중계 서버(Vercel)를 거쳐 미국 등 해외 서버로 암호화해서 보내요(국외 이전).'
        : `내가 등록한 API 키의 회사(${company})예요. 중계 서버 없이 이 기기에서 미국 등 해외 서버로 바로 보내요(국외 이전).`,
    },
    {
      icon: 'sparkles-outline',
      label: '쓰는 목적',
      text: '답장 추천, 대화 분석, 상대 분석 보고서, 연애 연습, 속마음 풀이 결과를 만드는 데 써요.',
    },
    {
      icon: 'server-outline',
      label: '보관',
      text: relay
        ? '중계 서버는 저장하지 않고 전달만 해요(이용 기록에 따로 동의했다면 캡처를 뺀 코칭 질문·답은 1년 보관). Google에서는 Gemini API 약관에 따라 보관·처리돼요.'
        : `우리 서버를 거치지 않아 우리 쪽엔 남지 않아요. ${company}에서는 그 회사의 약관과 개인정보 정책에 따라 보관·처리돼요.`,
    },
    {
      icon: 'hand-left-outline',
      label: '동의하지 않으면',
      text: '답장 추천 같은 AI 기능을 쓸 수 없어요. 동의한 뒤에도 마이 → AI 분석 동의에서 언제든 철회할 수 있어요.',
    },
  ];
  return {
    title: `대화 내용을 ${company} AI로 보내도 될까요?`,
    lead: `답장과 분석을 만들려면, 코칭에 필요한 내용을 ${company}의 AI(${ai})로 보내야 해요. 동의하면 다음부터는 묻지 않아요.`,
    rows,
  };
}

function ConsentSheet({ route, onAnswer }: { route: AiRoute; onAnswer: (agreed: boolean) => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const copy = consentCopy(route);

  // 작은 화면에서는 안내가 한 화면을 넘는다 — 뜰 때 스크롤 막대를 잠깐 보여 아래에 더 있다는 걸 알린다
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.flashScrollIndicators(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]}>
      {/* 바깥을 눌러도 닫히지 않는다 — 둘 중 하나를 직접 골라야 한다 */}
      <View style={[StyleSheet.absoluteFill, styles.backdrop]} />
      <View
        accessibilityViewIsModal
        // VoiceOver 닫기 제스처(두 손가락 문지르기)는 동의 안 함 — 안드로이드 뒤로 가기·웹 Esc 와 같다
        onAccessibilityEscape={() => onAnswer(false)}
        style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.lg, maxHeight: height - insets.top - Spacing.lg }]}>
        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.body}>
          <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name="shield-checkmark" size={22} color={theme.primary} />
          </View>
          <AppText variant="title2" accessibilityRole="header">
            {copy.title}
          </AppText>
          <AppText variant="small" color="textSecondary">
            {copy.lead}
          </AppText>
          <View style={[styles.rows, { backgroundColor: theme.surface }]}>
            {copy.rows.map((row) => (
              <View key={row.label} style={styles.row}>
                <Ionicons name={row.icon} size={18} color={theme.textSecondary} style={styles.rowIcon} />
                <View style={styles.rowTexts}>
                  <AppText variant="smallStrong">{row.label}</AppText>
                  <AppText variant="caption" color="textSecondary">
                    {row.text}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={styles.actions}>
          {/* 처리방침 링크는 스크롤과 상관없이 늘 보이게 버튼 위에 둔다 (2번: AI 전송·국외 이전) */}
          <AppText variant="smallStrong" color="primary" align="center" accessibilityRole="link" onPress={() => Linking.openURL(`${APP_CONFIG.privacyUrl}#ai`)} style={styles.link}>
            개인정보 처리방침 자세히 보기 ›
          </AppText>
          <Button title="동의하고 계속" onPress={() => onAnswer(true)} />
          <Button title="동의 안 함" variant="ghost" size="md" onPress={() => onAnswer(false)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { gap: Spacing.md, paddingBottom: Spacing.lg },
  badge: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  rows: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.lg },
  row: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  rowIcon: { marginTop: 1 },
  rowTexts: { flex: 1, gap: 2 },
  link: { alignSelf: 'center', paddingVertical: Spacing.xs },
  actions: { gap: Spacing.xs, paddingTop: Spacing.sm },
});
