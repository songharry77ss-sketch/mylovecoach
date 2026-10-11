import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { currentVersion, fetchAppUpdate, openStore, setUpdateRequestHandler, UPDATE_RETRY_MS, UPDATE_SNOOZE_MS, type AppUpdate } from '@/lib/app-update';
import { useAppStore } from '@/store/app-store';

/** 권하는 안내는 탭 첫 화면에서만 띄운다 — 시작 화면·결제·가입·로그인 복귀·코칭 중인 화면을 가리지 않게 */
const CALM_PATHS = new Set(['/', '/practice', '/tips', '/my']);

/**
 * 새 버전 안내 시트 — 루트 레이아웃에 한 번만 둔다.
 * 켤 때와 앱으로 돌아올 때 서버에 최신 버전을 묻고(lib/app-update 가 6시간에 한 번으로 줄인다), 스토어에 더 새 버전이 있으면 업데이트를 권한다.
 * 「나중에」를 누르면 그 버전은 3일 뒤에 다시 권한다. 서버가 최소 지원 버전을 올렸으면(required) 닫을 수 없다.
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

  const snoozed = update != null && snooze?.version === update.latest && now < snooze.until;
  const show = enabled && update != null && (update.required || asked || (!snoozed && onboarded && CALM_PATHS.has(pathname)));

  const latest = update?.latest;
  const required = update?.required;
  useEffect(() => {
    if (show && latest) track('update_prompt', { latest, required });
  }, [show, latest, required]);

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
            : '더 좋아진 나만의 연애코치로 업데이트해 보세요. 채팅방과 기록은 그대로 남아요.'}
        </AppText>
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
  versions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
  actions: { gap: Spacing.xs, paddingTop: Spacing.sm },
});
