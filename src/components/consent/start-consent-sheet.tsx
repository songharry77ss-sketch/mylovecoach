import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { GradientButton } from '@/components/brand/brand';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Brand, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { APP_CONFIG } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { L } from '@/lib/i18n';
import { BASIC_LOG_NOTICE, CONTENT_CONSENT_DETAIL, CONTENT_CONSENT_SUMMARY, CONTENT_CONSENT_TITLE, privacyUrl } from '@/lib/privacy-copy';

/** 동의 창의 답 — all 은 「모두 동의하고 시작」으로 시작했는지 (이용 기록용) */
export interface StartConsentAnswer {
  content: boolean;
  all: boolean;
}

interface Props {
  visible: boolean;
  onAgree: (answer: StartConsentAnswer) => void;
  onClose: () => void;
}

type Key = 'terms' | 'privacy' | 'content';

interface Item {
  key: Key;
  required: boolean;
  title: string;
  /** 체크박스 아래 안내 (선택 동의는 동의 전에 항목·목적·보관 기간·거부할 수 있음을 알려야 해서 길다) */
  body?: string;
  link: { label: string; url: string };
}

// 영어판 약관·처리방침 주소는 APP_CONFIG 가 같은 사이트의 /en/ 문서로 바꿔 준다
const ITEMS: Item[] = [
  { key: 'terms', required: true, title: L('이용약관 동의', 'I agree to the Terms of Use'), link: { label: L('보기', 'View'), url: APP_CONFIG.termsUrl } },
  { key: 'privacy', required: true, title: L('개인정보 처리방침 확인', 'I’ve read the Privacy Policy'), body: BASIC_LOG_NOTICE, link: { label: L('보기', 'View'), url: privacyUrl('analytics') } },
  { key: 'content', required: false, title: `${CONTENT_CONSENT_TITLE} — ${CONTENT_CONSENT_SUMMARY}`, body: CONTENT_CONSENT_DETAIL, link: { label: L('자세히', 'Details'), url: privacyUrl('content') } },
];

/** 체크 칸 앞 (필수)·(선택) */
const REQUIRED_TAG = L('필수', 'Required');
const OPTIONAL_TAG = L('선택', 'Optional');

const NONE: Record<Key, boolean> = { terms: false, privacy: false, content: false };

/**
 * 첫 화면 동의 창 — 처음 시작 버튼(캡처 올리기·상황만 적기·비밀 상담)을 누르면 뜬다.
 * 필수 2개(이용약관 동의·개인정보 처리방침 확인 — 서비스 이용 기록 자동 수집 안내 포함)와 선택 1개(코칭 내용 저장)를 각각 보여 주고,
 * 「모두 동의하고 시작」은 선택 항목까지 모두 체크해 시작한다. 체크는 모두 꺼진 채로 뜨고(선택 동의는 미리 체크 금지),
 * 선택 항목을 끈 채 「선택한 항목으로 시작」할 수 있다. AI 분석 동의(Google 로 보내기·국외 이전)는 이 창에 넣지 않는다 —
 * 받는 곳·항목·보관을 모두 알리는 별도 시트가 처음 AI 를 쓸 때 뜬다 (components/coach/ai-consent-sheet).
 * 띄우는 방식은 AI 분석 동의 시트와 같다 — 아이폰은 창 맨 위(FullWindowOverlay: 닫자마자 사진 선택 창을 열어도 막히지 않음), 안드로이드·웹은 Modal.
 */
export function StartConsentSheet({ visible, onAgree, onClose }: Props) {
  if (!visible) return null;
  if (Platform.OS === 'ios') {
    return (
      <FullWindowOverlay>
        <Sheet onAgree={onAgree} onClose={onClose} />
      </FullWindowOverlay>
    );
  }
  return (
    // 안드로이드 뒤로 가기·웹 Esc 는 닫기 (동의하지 않고 첫 화면으로)
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Sheet onAgree={onAgree} onClose={onClose} />
    </Modal>
  );
}

function Sheet({ onAgree, onClose }: Omit<Props, 'visible'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [checked, setChecked] = useState<Record<Key, boolean>>(NONE);
  const requiredDone = ITEMS.every((item) => !item.required || checked[item.key]);

  // 작은 화면에서는 안내가 한 화면을 넘는다 — 뜰 때 스크롤 막대를 잠깐 보여 아래에 더 있다는 걸 알린다
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.flashScrollIndicators(), 400);
    return () => clearTimeout(t);
  }, []);

  const toggle = (key: Key) => {
    haptic.select();
    setChecked((c) => ({ ...c, [key]: !c[key] }));
  };
  const agreeAll = () => {
    setChecked({ terms: true, privacy: true, content: true });
    onAgree({ content: true, all: true });
  };
  const agreeChosen = () => {
    if (!requiredDone) return;
    onAgree({ content: checked.content, all: false });
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]}>
      <Pressable accessibilityRole="button" accessibilityLabel={L('닫기', 'Close')} onPress={onClose} style={[StyleSheet.absoluteFill, styles.backdrop]} />
      <View
        accessibilityViewIsModal
        // VoiceOver 닫기 제스처(두 손가락 문지르기)는 닫기 — 안드로이드 뒤로 가기·웹 Esc 와 같다
        onAccessibilityEscape={onClose}
        style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.lg, maxHeight: height - insets.top - Spacing.lg }]}>
        <View style={styles.head}>
          <AppText variant="title2" accessibilityRole="header" style={styles.headTitle}>
            {L('시작하기 전에 확인해 주세요', 'Before you start')}
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={L('닫기', 'Close')} onPress={onClose} hitSlop={12} style={[styles.close, { backgroundColor: theme.surface }]}>
            <Ionicons name="close" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.body}>
          <AppText variant="small" color="textSecondary">
            {L('필수 항목에 동의하면 바로 시작할 수 있어요. 선택 항목은 동의하지 않아도 모든 기능을 쓸 수 있어요.', 'Agree to the required items to get started. You can use every feature even if you skip the optional one.')}
          </AppText>
          <View style={styles.items}>
            {ITEMS.map((item, i) => {
              const on = checked[item.key];
              const label = `(${item.required ? REQUIRED_TAG : OPTIONAL_TAG}) ${item.title}`;
              return (
                <View key={item.key} style={[styles.item, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator } : null]}>
                  <View style={styles.itemHead}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={label}
                      onPress={() => toggle(item.key)}
                      hitSlop={6}
                      style={styles.check}>
                      {/* 체크한 칸은 센딧 파랑 단색 (1.4 — 그라데이션을 걷었다) */}
                      <View style={[styles.box, on ? { backgroundColor: theme.primary, borderColor: theme.primary } : { borderColor: theme.textTertiary }]}>
                        {on ? <Ionicons name="checkmark" size={14} color={Brand.onBrand} /> : null}
                      </View>
                      <AppText variant="smallStrong" style={styles.checkText}>
                        <AppText variant="smallStrong" color={item.required ? 'primary' : 'textSecondary'}>
                          ({item.required ? REQUIRED_TAG : OPTIONAL_TAG})
                        </AppText>{' '}
                        {item.title}
                      </AppText>
                    </Pressable>
                    {/* 체크박스 줄 밖에 둔다 — 안에 두면 링크를 눌러도 체크가 바뀌고, 화면 읽기에서 링크에 닿지 못한다 */}
                    <AppText
                      variant="caption"
                      color="primary"
                      accessibilityRole="link"
                      accessibilityLabel={L(`${item.title} ${item.link.label}`, `${item.link.label}: ${item.title}`)}
                      onPress={() => Linking.openURL(item.link.url).catch(() => {})}
                      style={styles.link}>
                      {item.link.label} ›
                    </AppText>
                  </View>
                  {/* 고지 글은 줄이지 않고 읽기 쉽게 — 12pt → 13pt, 줄 간격을 넓혔다 */}
                  {item.body ? (
                    <AppText variant="small" color="textSecondary" style={styles.itemBody}>
                      {item.body}
                    </AppText>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
        <View style={styles.actions}>
          <GradientButton title={L('모두 동의하고 시작', 'Agree to all and start')} onPress={agreeAll} />
          <Button title={L('선택한 항목으로 시작', 'Start with selected')} variant="ghost" size="md" disabled={!requiredDone} onPress={agreeChosen} />
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
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  headTitle: { flex: 1 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { gap: Spacing.md, paddingBottom: Spacing.lg },
  items: { marginTop: Spacing.xs },
  item: { gap: Spacing.xs + 2, paddingVertical: Spacing.md },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  check: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkText: { flex: 1 },
  link: { paddingTop: 2 },
  // 체크박스(20) + 간격만큼 들여 안내 글과 줄을 맞춘다
  itemBody: { marginLeft: 20 + Spacing.sm, fontSize: 13, lineHeight: 20 },
  actions: { gap: Spacing.xs, paddingTop: Spacing.sm },
});
