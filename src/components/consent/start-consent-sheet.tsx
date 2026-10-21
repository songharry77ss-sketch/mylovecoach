import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { APP_CONFIG } from '@/lib/config';
import { haptic } from '@/lib/haptics';
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

const ITEMS: Item[] = [
  { key: 'terms', required: true, title: '이용약관 동의', link: { label: '보기', url: APP_CONFIG.termsUrl } },
  { key: 'privacy', required: true, title: '개인정보 처리방침 확인', body: BASIC_LOG_NOTICE, link: { label: '보기', url: privacyUrl('analytics') } },
  { key: 'content', required: false, title: `${CONTENT_CONSENT_TITLE} — ${CONTENT_CONSENT_SUMMARY}`, body: CONTENT_CONSENT_DETAIL, link: { label: '자세히', url: privacyUrl('content') } },
];

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
      <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={[StyleSheet.absoluteFill, styles.backdrop]} />
      <View
        accessibilityViewIsModal
        // VoiceOver 닫기 제스처(두 손가락 문지르기)는 닫기 — 안드로이드 뒤로 가기·웹 Esc 와 같다
        onAccessibilityEscape={onClose}
        style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.lg, maxHeight: height - insets.top - Spacing.lg }]}>
        <View style={styles.head}>
          <AppText variant="title2" accessibilityRole="header" style={styles.headTitle}>
            시작하기 전에 확인해 주세요
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={12} style={[styles.close, { backgroundColor: theme.surface }]}>
            <Ionicons name="close" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.body}>
          <AppText variant="small" color="textSecondary">
            필수 항목에 동의하면 바로 시작할 수 있어요. 선택 항목은 동의하지 않아도 모든 기능을 쓸 수 있어요.
          </AppText>
          <View style={[styles.items, { backgroundColor: theme.surface }]}>
            {ITEMS.map((item) => {
              const on = checked[item.key];
              const label = `(${item.required ? '필수' : '선택'}) ${item.title}`;
              return (
                <View key={item.key} style={styles.item}>
                  <View style={styles.itemHead}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={label}
                      onPress={() => toggle(item.key)}
                      hitSlop={6}
                      style={styles.check}>
                      <View style={[styles.box, { borderColor: on ? theme.primary : theme.textTertiary, backgroundColor: on ? theme.primary : 'transparent' }]}>
                        {on ? <Ionicons name="checkmark" size={12} color={theme.primaryText} /> : null}
                      </View>
                      <AppText variant="smallStrong" style={styles.checkText}>
                        <AppText variant="smallStrong" color={item.required ? 'primary' : 'textSecondary'}>
                          ({item.required ? '필수' : '선택'})
                        </AppText>{' '}
                        {item.title}
                      </AppText>
                    </Pressable>
                    {/* 체크박스 줄 밖에 둔다 — 안에 두면 링크를 눌러도 체크가 바뀌고, 화면 읽기에서 링크에 닿지 못한다 */}
                    <AppText
                      variant="caption"
                      color="primary"
                      accessibilityRole="link"
                      accessibilityLabel={`${item.title} ${item.link.label}`}
                      onPress={() => Linking.openURL(item.link.url)}
                      style={styles.link}>
                      {item.link.label} ›
                    </AppText>
                  </View>
                  {item.body ? (
                    <AppText variant="caption" color="textSecondary" style={styles.itemBody}>
                      {item.body}
                    </AppText>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
        <View style={styles.actions}>
          <Button title="모두 동의하고 시작" onPress={agreeAll} />
          <Button title="선택한 항목으로 시작" variant="ghost" size="md" disabled={!requiredDone} onPress={agreeChosen} />
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
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { gap: Spacing.md, paddingBottom: Spacing.lg },
  items: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.lg },
  item: { gap: Spacing.xs },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  check: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkText: { flex: 1 },
  link: { paddingTop: 2 },
  // 체크박스(20) + 간격만큼 들여 안내 글과 줄을 맞춘다
  itemBody: { marginLeft: 20 + Spacing.sm },
  actions: { gap: Spacing.xs, paddingTop: Spacing.sm },
});
