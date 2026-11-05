import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Image, Keyboard, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { compareVersions, currentVersion, fetchAppUpdate, openStore, setUpdateRequestHandler, UPDATE_RETRY_MS, UPDATE_SNOOZE_MS, type AppUpdate } from '@/lib/app-update';
import { subscriptionStoreName } from '@/lib/billing/plans';
import { useAppStore } from '@/store/app-store';

/** 권하는 안내는 탭 첫 화면에서만 띄운다 — 시작 화면·결제·가입·로그인 복귀·코칭 중인 화면을 가리지 않게 */
const CALM_PATHS = new Set(['/', '/practice', '/tips', '/my']);

/**
 * 새 버전 안내 시트 — 루트 레이아웃에 한 번만 둔다.
 * 켤 때와 앱으로 돌아올 때 서버에 최신 버전을 묻고(lib/app-update 가 6시간에 한 번으로 줄인다), 스토어에 더 새 버전이 있으면 업데이트를 권한다.
 * 「나중에」를 누르면 그 버전은 3일 뒤에 다시 권한다. 서버가 최소 지원 버전을 올렸으면(required) 닫을 수 없다.
 * 서버가 새 버전의 「새로운 기능」 문구를 알려 주면 무엇이 좋아졌는지 세 줄까지 보여 준다 (업데이트할 이유).
 * 꼭 해야 하는 업데이트는 시트가 아니라 전체 화면(RequiredUpdate)으로 띄운다 — 앱 아이콘·좋아진 점·「기록은 그대로」를 보여 주고 스토어로 보낸다.
 * 띄우는 방식은 AI 분석 동의 시트와 같다 (아이폰은 창 맨 위, 안드로이드·웹은 Modal).
 */
export function AppUpdateHost({ enabled }: { enabled: boolean }) {
  const hydrated = useAppStore((s) => s.hydrated);
  const update = useAppStore((s) => s.appUpdate);
  const snooze = useAppStore((s) => s.updateSnooze);
  const onboarded = useAppStore((s) => s.user != null);
  const pathname = usePathname();
  const [now, setNow] = useState(() => Date.now());
  // 서버가 요청을 「업데이트가 필요해요」로 거절했을 때 — 어느 화면이든 바로 띄운다
  const [asked, setAsked] = useState(false);

  const check = useCallback((force: boolean) => {
    setNow(Date.now());
    fetchAppUpdate(Date.now(), force)
      .then((found) => {
        if (found === undefined) return;
        const store = useAppStore.getState();
        store.setAppUpdate(found);
        if (force && found) {
          store.snoozeUpdate(null);
          setAsked(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    check(false);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check(false);
    });
    setUpdateRequestHandler(() => check(true));
    return () => {
      sub.remove();
      setUpdateRequestHandler(null);
    };
  }, [hydrated, check]);

  // 미룬 버전과 같거나 그보다 낮은 버전은 미룬 것으로 본다 (서버 인스턴스마다 최신 버전이 잠깐 엇갈려도 다시 뜨지 않게)
  const snoozed = update != null && snooze != null && compareVersions(snooze.version, update.latest) >= 0 && now < snooze.until;
  const show = enabled && update != null && (update.required || asked || (!snoozed && onboarded && CALM_PATHS.has(pathname)));

  const latest = update?.latest;
  const required = update?.required;
  const noteCount = update?.notes?.length ?? 0;
  useEffect(() => {
    if (!show || !latest) return;
    // 아이폰의 창 덮개는 키보드 아래에 깔린다 — 입력하다 떴으면 키보드가 버튼을 가리지 않게 내린다
    Keyboard.dismiss();
    track('update_prompt', { latest, required, notes: noteCount });
  }, [show, latest, required, noteCount]);

  if (!show || !update) return null;

  const later = () => {
    if (update.required) return;
    track('update_later', { latest: update.latest });
    setAsked(false);
    setNow(Date.now());
    useAppStore.getState().snoozeUpdate({ version: update.latest, until: Date.now() + UPDATE_SNOOZE_MS });
  };
  const go = () => {
    track('update_open', { latest: update.latest, required: update.required });
    openStore().catch(() => {});
    // 꼭 해야 하는 업데이트는 시트를 그대로 둔다. 권하는 업데이트는 닫고, 그대로 돌아오면 하루 뒤 다시 권한다
    if (update.required) return;
    setAsked(false);
    setNow(Date.now());
    useAppStore.getState().snoozeUpdate({ version: update.latest, until: Date.now() + UPDATE_RETRY_MS });
  };

  if (Platform.OS === 'ios') {
    return (
      <FullWindowOverlay>
        <UpdateSheet update={update} onUpdate={go} onLater={later} />
      </FullWindowOverlay>
    );
  }
  return (
    // 안드로이드 뒤로 가기는 「나중에」 (꼭 해야 하는 업데이트면 닫히지 않는다)
    <Modal visible transparent animationType="slide" onRequestClose={later}>
      <UpdateSheet update={update} onUpdate={go} onLater={later} />
    </Modal>
  );
}

function UpdateSheet({ update, onUpdate, onLater }: { update: AppUpdate; onUpdate: () => void; onLater: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const current = currentVersion();
  const notes = update.notes ?? [];
  if (update.required) return <RequiredUpdate update={update} onUpdate={onUpdate} />;
  return (
    <View style={[StyleSheet.absoluteFill, styles.root]}>
      <View style={[StyleSheet.absoluteFill, styles.backdrop]} />
      <View
        accessibilityViewIsModal
        onAccessibilityEscape={onLater}
        style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
          <Ionicons name="arrow-up-circle" size={24} color={theme.primary} />
        </View>
        <AppText variant="title2" accessibilityRole="header">
          {update.required ? '업데이트가 필요해요' : '새 버전이 나왔어요'}
        </AppText>
        <AppText variant="small" color="textSecondary">
          {update.required
            ? '지금 버전은 더 이상 지원하지 않아요. 업데이트하면 채팅방과 기록 그대로 이어서 쓸 수 있어요.'
            : notes.length
              ? '이번 버전에서 이렇게 좋아졌어요. 채팅방과 기록은 그대로 남아요.'
              : '더 좋아진 나만의 연애코치로 업데이트해 보세요. 채팅방과 기록은 그대로 남아요.'}
        </AppText>
        {notes.length ? (
          <View style={styles.notes}>
            {notes.map((note) => (
              <View key={note} style={styles.note}>
                <Ionicons name="checkmark-circle" size={18} color={theme.primary} style={styles.noteIcon} />
                <AppText variant="small" style={styles.noteText}>
                  {note}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
        <View style={[styles.versions, { backgroundColor: theme.surface }]}>
          <AppText variant="caption" color="textSecondary">
            지금 버전 {current}
          </AppText>
          <Ionicons name="arrow-forward" size={14} color={theme.textSecondary} />
          <AppText variant="smallStrong" color="primary">
            새 버전 {update.latest}
          </AppText>
        </View>
        <View style={styles.actions}>
          <Button title="업데이트하기" onPress={onUpdate} />
          {update.required ? null : <Button title="나중에" variant="ghost" size="md" onPress={onLater} />}
        </View>
      </View>
    </View>
  );
}

const appIcon = require('../../../assets/images/icon.png');
/** 업데이트해도 잃는 것이 없다는 약속 — 꼭 해야 하는 업데이트 화면 아래쪽 */
const PROMISES = [
  { icon: 'chatbubbles-outline', text: '채팅방 그대로' },
  { icon: 'time-outline', text: '1분이면 끝' },
  { icon: 'heart-outline', text: '이용권도 그대로' },
] as const;

/**
 * 꼭 해야 하는 업데이트 — 닫을 수 없는 전체 화면.
 * 지금 버전으로는 더 쓸 수 없다는 것보다 「새 버전에서 무엇이 좋아졌는지」와 「잃는 것이 없다」를 먼저 보여 주고, 버튼 하나로 스토어에 보낸다.
 */
function RequiredUpdate({ update, onUpdate }: { update: AppUpdate; onUpdate: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const notes = update.notes ?? [];
  const store = subscriptionStoreName(Platform.OS);
  return (
    <View accessibilityViewIsModal style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]}>
      {/* 위쪽을 은은하게 물들이는 배경 원 두 개 */}
      <View pointerEvents="none" style={[styles.glow, styles.glowLeft, { backgroundColor: theme.primarySoft }]} />
      <View pointerEvents="none" style={[styles.glow, styles.glowRight, { backgroundColor: theme.accentSoft }]} />
      <ScrollView contentContainerStyle={[styles.requiredBody, { paddingTop: insets.top + Spacing.xxl }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.iconFrame, Shadow, { backgroundColor: theme.background }]}>
          <Image source={appIcon} style={styles.appIcon} accessibilityIgnoresInvertColors accessible={false} />
          <View style={[styles.iconBadge, { backgroundColor: theme.primary, borderColor: theme.background }]}>
            <Ionicons name="arrow-up" size={14} color="#fff" />
          </View>
        </View>
        <View style={[styles.versionPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <AppText variant="caption" color="textSecondary">
            {currentVersion()}
          </AppText>
          <Ionicons name="arrow-forward" size={12} color={theme.textSecondary} />
          <AppText variant="smallStrong" color="primary">
            {update.latest}
          </AppText>
        </View>
        <AppText variant="title1" align="center" accessibilityRole="header">
          업데이트가 필요해요
        </AppText>
        <AppText variant="body" color="textSecondary" align="center" style={styles.requiredLead}>
          더 좋아진 나만의 연애코치가 기다리고 있어요.{'\n'}지금 버전으로는 더 이상 코칭을 받을 수 없어요.
        </AppText>
        {notes.length ? (
          <View style={[styles.notesCard, Shadow, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <AppText variant="smallStrong" color="primary">
              이번 버전에서 좋아진 점
            </AppText>
            {notes.map((note) => (
              <View key={note} style={styles.note}>
                <Ionicons name="sparkles" size={16} color={theme.primary} style={styles.noteIcon} />
                <AppText variant="small" style={styles.noteText}>
                  {note}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.promises}>
          {PROMISES.map((p) => (
            <View key={p.text} style={[styles.promise, { backgroundColor: theme.surface }]}>
              <Ionicons name={p.icon} size={18} color={theme.primary} />
              <AppText variant="caption" color="textSecondary" align="center">
                {p.text}
              </AppText>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={[styles.requiredFooter, { paddingBottom: insets.bottom + Spacing.lg, borderTopColor: theme.border, backgroundColor: theme.background }]}>
        <Button title="업데이트하기" onPress={onUpdate} />
        <AppText variant="caption" color="textSecondary" align="center">
          {store}에서 업데이트한 뒤 앱을 다시 열어 주세요
        </AppText>
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
    gap: Spacing.md,
  },
  badge: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  notes: { gap: Spacing.sm },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  noteIcon: { marginTop: 1 },
  noteText: { flex: 1 },
  versions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
  actions: { gap: Spacing.xs, paddingTop: Spacing.sm },
  // 꼭 해야 하는 업데이트 (전체 화면)
  glow: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.9 },
  glowLeft: { top: -140, left: -120 },
  glowRight: { top: -60, right: -150 },
  requiredBody: { flexGrow: 1, alignItems: 'center', gap: Spacing.lg, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  iconFrame: { width: 104, height: 104, borderRadius: 28, padding: 6, marginBottom: Spacing.xs },
  appIcon: { width: '100%', height: '100%', borderRadius: 22 },
  iconBadge: { position: 'absolute', right: -6, bottom: -6, width: 30, height: 30, borderRadius: 15, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  versionPill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md },
  requiredLead: { marginTop: -Spacing.sm },
  notesCard: { alignSelf: 'stretch', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.lg },
  promises: { alignSelf: 'stretch', flexDirection: 'row', gap: Spacing.sm },
  promise: { flex: 1, alignItems: 'center', gap: Spacing.xs, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xs },
  requiredFooter: { gap: Spacing.sm, paddingTop: Spacing.md, paddingHorizontal: Spacing.xl, borderTopWidth: StyleSheet.hairlineWidth, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});
