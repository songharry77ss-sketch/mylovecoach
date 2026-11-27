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
import { L } from '@/lib/i18n';

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
  label: string;
  text: string;
}

/**
 * 시트 문구. 개인정보 처리방침(site/privacy.html 1·2번(국외 이전 표 포함)·4·5번)에 적힌 내용만 쓴다 — 처리방침을 고치면 여기도 같이 고칠 것.
 * 서버를 거치면 Anthropic(Claude) 먼저, 답하지 못하면 OpenAI(GPT), 그다음 Google(Gemini). 개인 키면 그 키의 회사로 바로 간다.
 * 모두 미국 등 해외 서버라 국외 이전이다.
 */
function consentCopy(route: AiRoute) {
  const { company, ai } = AI_PROVIDER_LABEL[route.provider];
  const relay = route.via === 'relay';
  const rows: ConsentRow[] = [
    {
      label: L('보내는 내용', 'What we send'),
      text: L(
        '대화 캡처 이미지, 입력한 대화·상황 글, 내 프로필·상대 정보(이름·성별·나이·MBTI·메모 등), 최근 코칭 기록, 센딧이 기억하는 이야기(지난 대화에서 정리한 짧은 메모)와 같은 채팅방에서 이전에 요청한 답장 방식·주의사항이에요. 캡처 속 상대방의 이름과 메시지도 함께 가요.',
        'Chat screenshots, the conversation or situation you type, your profile and their info (name, gender, age, MBTI, notes, etc.), recent coaching history, what your coach remembers (short notes from past chats), and the reply style and cautions you asked for earlier in the same chat. The other person’s name and messages in the screenshot are sent too.',
      ),
    },
    {
      label: L('받는 곳', 'Who receives it'),
      text: relay
        ? L(
            '먼저 Anthropic PBC의 Claude API로 보내요. 답하지 못하면(한도·혼잡·오류) 같은 내용을 OpenAI, L.L.C.의 OpenAI API로, 그래도 안 되면 Google LLC의 Gemini API로 보내요. 모두 중계 서버(Vercel)를 거쳐 미국 등 해외 서버로 암호화해서 보내요(국외 이전).',
            'First, Anthropic PBC’s Claude API. If it can’t answer (limits, traffic, errors), the same content goes to OpenAI, L.L.C.’s OpenAI API, and if that fails, Google LLC’s Gemini API. Everything passes through our relay server (Vercel) and is sent encrypted to servers in the US and other countries (international transfer).',
          )
        : L(
            `내가 등록한 API 키의 회사(${company})예요. 중계 서버 없이 이 기기에서 미국 등 해외 서버로 바로 보내요(국외 이전).`,
            `The company of the API key you added (${company}). It’s sent straight from this device to servers in the US and other countries, with no relay server (international transfer).`,
          ),
    },
    {
      label: L('쓰는 목적', 'Why'),
      text: L(
        '답장 추천, 대화 분석, 상대 분석 보고서, 연애 연습, 속마음 풀이 결과를 만드는 데 써요.',
        'To create reply ideas, chat analysis, crush reports, practice chats, and read-their-mind results.',
      ),
    },
    {
      label: L('보관', 'Storage'),
      text: relay
        ? L(
            '중계 서버는 저장하지 않고 전달만 해요(코칭 내용 저장에 따로 동의했다면 캡처를 뺀 코칭 질문·답은 1년 보관). 받은 회사에서는 각 회사의 API 약관과 개인정보 정책에 따라 보관·처리돼요.',
            'Our relay server doesn’t store it—it only passes it along (if you separately agreed to let us save coaching data, your coaching questions and answers, without screenshots, are kept for 1 year). Each receiving company stores and processes it under its own API terms and privacy policy.',
          )
        : L(
            `우리 서버를 거치지 않아 우리 쪽엔 남지 않아요. ${company}에서는 그 회사의 약관과 개인정보 정책에 따라 보관·처리돼요.`,
            `It never goes through our servers, so nothing stays with us. ${company} stores and processes it under its own terms and privacy policy.`,
          ),
    },
    {
      label: L('동의하지 않으면', 'If you don’t agree'),
      text: L(
        '답장 추천 같은 AI 기능을 쓸 수 없어요. 동의한 뒤에도 마이 → 개인정보에서 언제든 철회할 수 있어요.',
        'You won’t be able to use AI features like reply ideas. You can withdraw consent anytime from your profile tab → Privacy.',
      ),
    },
  ];
  if (relay) {
    return {
      title: L('대화 내용을 AI로 보내도 될까요?', 'OK to send your chat to AI?'),
      lead: L(
        '답장과 분석을 만들려면, 코칭에 필요한 내용을 AI로 보내야 해요. Anthropic(Claude)이 먼저 답하고, 막히면 OpenAI(GPT)·Google(Gemini)이 대신 답해요. 동의하면 다음부터는 묻지 않아요.',
        'To create replies and analysis, we need to send what’s needed for coaching to AI. Anthropic (Claude) answers first; if it’s stuck, OpenAI (GPT) or Google (Gemini) answers instead. Once you agree, we won’t ask again.',
      ),
      rows,
    };
  }
  return {
    title: L(`대화 내용을 ${company} AI로 보내도 될까요?`, `OK to send your chat to ${company} AI?`),
    lead: L(
      `답장과 분석을 만들려면, 코칭에 필요한 내용을 ${company}의 AI(${ai})로 보내야 해요. 동의하면 다음부터는 묻지 않아요.`,
      `To create replies and analysis, we need to send what’s needed for coaching to ${company}’s AI (${ai}). Once you agree, we won’t ask again.`,
    ),
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
          {/* 1.4 개편: 방패 아이콘 타일·줄마다 아이콘을 걷고, 항목 이름 + 내용을 가는 선으로 나눈 키-값 줄로 (글은 그대로, 12pt → 14pt) */}
          <AppText variant="title2" accessibilityRole="header">
            {copy.title}
          </AppText>
          <AppText variant="small" color="textSecondary" style={styles.lead}>
            {copy.lead}
          </AppText>
          <View style={styles.rows}>
            {copy.rows.map((row, i) => (
              <View key={row.label} style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator } : null]}>
                <AppText variant="smallStrong">{row.label}</AppText>
                <AppText variant="small" color="textSecondary" style={styles.rowText}>
                  {row.text}
                </AppText>
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={styles.actions}>
          {/* 처리방침 링크는 스크롤과 상관없이 늘 보이게 버튼 위에 둔다 (2번: AI 전송·국외 이전) */}
          <AppText variant="smallStrong" color="primary" align="center" accessibilityRole="link" onPress={() => Linking.openURL(`${APP_CONFIG.privacyUrl}#ai`)} style={styles.link}>
            {L('개인정보 처리방침 자세히 보기 ›', 'Read our Privacy Policy ›')}
          </AppText>
          <Button title={L('동의하고 계속', 'Agree & continue')} onPress={() => onAnswer(true)} />
          <Button title={L('동의 안 함', 'Don’t agree')} variant="ghost" size="md" onPress={() => onAnswer(false)} />
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
  lead: { lineHeight: 21 },
  rows: { marginTop: Spacing.xs },
  row: { gap: 4, paddingVertical: Spacing.md },
  rowText: { lineHeight: 21 },
  link: { alignSelf: 'center', paddingVertical: Spacing.xs },
  actions: { gap: Spacing.xs, paddingTop: Spacing.sm },
});
