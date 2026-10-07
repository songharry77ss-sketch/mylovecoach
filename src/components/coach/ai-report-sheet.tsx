import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Linking, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { aiReportAvailable, crushReportContent, mindReportContent, sendAiReport } from '@/lib/ai-report';
import {
  AI_REPORT_MODE_LABEL,
  AI_REPORT_MODES,
  AI_REPORT_NOTE_MAX,
  AI_REPORT_REASON_LABEL,
  AI_REPORT_REASONS,
  type AiReportMode,
  type AiReportReason,
} from '@/lib/ai-report-schema';
import { APP_CONFIG } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import type { CrushReport, MindReading } from '@/lib/types';

/** 무엇을 신고하는지. content 가 없으면 마이 탭처럼 기능을 고르고 메모만으로 신고한다 */
export interface AiReportTarget {
  mode?: AiReportMode;
  /** 신고할 AI 답변 (화면에 보이는 그대로) */
  content?: string;
  /** 비밀 상담에서 연 신고 — 신고하면 이 답변은 저장된다고 먼저 알린다 */
  secret?: boolean;
}

/**
 * 신고 시트를 여는 함수와 화면에 둘 시트. 데모이거나 신고를 받을 서버가 없으면 available=false — 진입점을 숨긴다.
 * 시트는 쓰는 화면 안에 둔다 (루트에 두면 아이폰에서 네이티브 모달 위에 뜨지 못한다)
 */
export function useAiReport() {
  const [target, setTarget] = useState<AiReportTarget | null>(null);
  const open = useCallback((next: AiReportTarget = {}) => {
    if (!aiReportAvailable) return;
    Keyboard.dismiss();
    haptic.tap();
    setTarget(next);
  }, []);
  const close = useCallback(() => setTarget(null), []);
  return { available: aiReportAvailable, open, sheet: <AiReportSheet target={target} onClose={close} /> };
}

type AiReportLinkProps = { label: string } & ({ mode: 'report'; report: CrushReport } | { mode: 'mind'; situation: string; reading: MindReading });

/** 결과 화면 아래에 두는 한 줄 신고 링크 (상대 분석 보고서 · 속마음 풀이) */
export function AiReportLink(props: AiReportLinkProps) {
  const theme = useTheme();
  const { available, open, sheet } = useAiReport();
  if (!available) return null;
  const content = props.mode === 'report' ? crushReportContent(props.report) : mindReportContent(props.situation, props.reading);
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => open({ mode: props.mode, content })} hitSlop={8} style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
        <Ionicons name="flag-outline" size={13} color={theme.textTertiary} />
        <AppText variant="caption" color="textTertiary">
          {props.label}
        </AppText>
      </Pressable>
      {sheet}
    </>
  );
}

/**
 * 신고 시트 — 사유를 고르고(메모는 선택) 「신고하기」. 보내지 못하면 시트를 그대로 두고 이유를 보여 준다.
 * 보내는 동안에는 닫지 않는다 — 닫고 다른 답변 신고를 연 뒤 앞 요청이 끝나면 새 시트가 닫히거나, 앞 요청의 실패가 묻히지 않게
 */
export function AiReportSheet({ target, onClose }: { target: AiReportTarget | null; onClose: () => void }) {
  const sending = useRef(false);
  return (
    // 안드로이드 뒤로 가기·웹 Esc 는 닫기 (보내는 중이면 무시)
    <Modal
      visible={target != null}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!sending.current) onClose();
      }}>
      {target ? (
        <ReportForm
          target={target}
          onClose={onClose}
          onSendingChange={(value) => {
            sending.current = value;
          }}
        />
      ) : null}
    </Modal>
  );
}

function ReportForm({ target, onClose, onSendingChange }: { target: AiReportTarget; onClose: () => void; onSendingChange: (sending: boolean) => void }) {
  const theme = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const general = !target.content;
  const [mode, setMode] = useState<AiReportMode>(target.mode ?? 'coach');
  const [reason, setReason] = useState<AiReportReason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 답변 없이 신고할 때는 무엇이 문제였는지 적어야 운영자가 알 수 있다
  const canSend = reason != null && (!general || note.trim().length > 0);

  const submit = async () => {
    if (!reason || !canSend || sending) return;
    setSending(true);
    onSendingChange(true);
    setError(null);
    try {
      await sendAiReport({ mode, reason, note, content: target.content });
      onSendingChange(false);
      haptic.success();
      onClose();
      toast.show('신고했어요. 알려 주셔서 고마워요.', 'success');
    } catch (e) {
      // 모달 위에서는 토스트가 가려지므로 시트 안에 보여 준다
      onSendingChange(false);
      haptic.error();
      setError(e instanceof Error ? e.message : '신고를 보내지 못했어요. 잠시 후 다시 시도해주세요.');
      setSending(false);
    }
  };
  // 바깥 누르기·접근성 닫기 동작 — 보내는 중에는 결과가 나올 때까지 그대로 둔다
  const dismiss = () => {
    if (!sending) onClose();
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.root}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={dismiss} accessibilityLabel="닫기" />
      <View
        accessibilityViewIsModal
        onAccessibilityEscape={dismiss}
        style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.lg, maxHeight: height - insets.top - Spacing.lg }]}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.head}>
            <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="flag" size={20} color={theme.accent} />
            </View>
            <AppText variant="title2" accessibilityRole="header">
              AI 답변 신고
            </AppText>
          </View>
          <AppText variant="small" color="textSecondary">
            불쾌하거나 부적절한 답변이었다면 알려 주세요. 운영자가 확인하고 고칠게요.
          </AppText>

          {target.secret ? (
            <View style={[styles.box, { backgroundColor: theme.accentSoft }]}>
              <AppText variant="smallStrong" color="accent">
                🕶️ 비밀 상담 중이에요. 신고하면 이 답변은 저장돼요.
              </AppText>
              <AppText variant="caption" color="textSecondary">
                비밀 상담 내용은 원래 어디에도 남지 않지만, 신고한 답변은 운영자 검토를 위해 1년 동안 보관돼요.
              </AppText>
            </View>
          ) : null}

          {general ? (
            <>
              <AppText variant="smallStrong">어느 기능의 답변인가요?</AppText>
              <View style={styles.chips}>
                {AI_REPORT_MODES.map((m) => (
                  <Chip key={m} size="sm" label={AI_REPORT_MODE_LABEL[m]} selected={mode === m} onPress={() => setMode(m)} />
                ))}
              </View>
            </>
          ) : (
            <View style={[styles.box, { backgroundColor: theme.surface }]}>
              <AppText variant="caption" color="textTertiary">
                신고할 답변
              </AppText>
              {/* 보내는 내용을 끝까지 볼 수 있게 — 길면 이 상자 안에서 스크롤 */}
              <ScrollView style={styles.preview} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                <AppText variant="small">{target.content}</AppText>
              </ScrollView>
            </View>
          )}

          <AppText variant="smallStrong">신고 사유</AppText>
          <View style={styles.chips}>
            {AI_REPORT_REASONS.map((r) => (
              <Chip key={r} size="sm" tone="accent" label={AI_REPORT_REASON_LABEL[r]} selected={reason === r} onPress={() => setReason(r)} />
            ))}
          </View>

          <TextField
            value={note}
            onChangeText={setNote}
            placeholder={general ? '받은 답변과 문제였던 점을 적어 주세요' : '무엇이 문제였는지 적어 주세요 (선택)'}
            multiline
            maxLength={AI_REPORT_NOTE_MAX}
            helper={`${note.length}/${AI_REPORT_NOTE_MAX}`}
            accessibilityLabel="신고 메모"
          />

          <AppText variant="caption" color="textTertiary">
            {general
              ? '신고하면 적은 내용과 고른 사유가 운영자에게 전송돼 검토·필터 개선에 쓰이고 1년 뒤 지워져요'
              : target.mode === 'mind'
                ? '신고하면 이 풀이와 물어본 상황 글, 고른 사유가 운영자에게 전송돼 검토·필터 개선에 쓰이고 1년 뒤 지워져요'
                : '신고하면 이 AI 답변 내용과 고른 사유가 운영자에게 전송돼 검토·필터 개선에 쓰이고 1년 뒤 지워져요'}
          </AppText>
          <AppText variant="caption" color="primary" accessibilityRole="link" onPress={() => Linking.openURL(`${APP_CONFIG.privacyUrl}#report`)} style={styles.policy}>
            개인정보 처리방침 자세히 보기 ›
          </AppText>
          {error ? (
            <AppText variant="small" color="danger" accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : null}
        </ScrollView>
        <View style={styles.actions}>
          <Button title="신고하기" onPress={submit} loading={sending} disabled={!canSend} />
          <Button title="취소" variant="ghost" size="md" onPress={onClose} disabled={sending} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
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
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  badge: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  box: { borderRadius: Radius.md, padding: Spacing.md, gap: 4 },
  preview: { maxHeight: 180, flexGrow: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  policy: { alignSelf: 'flex-start' },
  actions: { gap: Spacing.xs, paddingTop: Spacing.sm },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'center', paddingVertical: Spacing.xs },
});
