import { Ionicons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Brand, Colors, Radius, Spacing, palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ToastState {
  id: number;
  message: string;
  tone: 'default' | 'success' | 'error';
}

interface ToastContextValue {
  show: (message: string, tone?: ToastState['tone']) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, tone: ToastState['tone'] = 'default') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    timer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const value = useMemo(() => ({ show }), [show]);
  // 토스 결의 짙은 알약 하나 — 성공은 하늘색 체크, 실패는 빨간 느낌표로만 구분한다 (분홍·에스프레소 바탕은 쓰지 않는다)
  const scheme = useColorScheme();
  const bg = scheme === 'dark' ? Colors.dark.surfaceSelected : palette.sendInk;
  const icon = toast?.tone === 'success' ? ('checkmark-circle' as const) : toast?.tone === 'error' ? ('alert-circle' as const) : null;
  const iconColor = toast?.tone === 'success' ? Brand.sky : Colors.dark.danger;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + 90 }]}>
          <Animated.View
            key={toast.id}
            entering={FadeInDown.springify().damping(16)}
            exiting={FadeOutDown.duration(180)}
            accessibilityLiveRegion="polite"
            style={[styles.toast, { backgroundColor: bg }]}>
            {icon ? <Ionicons name={icon} size={18} color={iconColor} /> : null}
            <AppText variant="smallStrong" color={palette.white} style={styles.text}>
              {toast.message}
            </AppText>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: Spacing.lg },
  toast: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg + 2, paddingVertical: Spacing.md, borderRadius: Radius.lg, maxWidth: 420 },
  text: { flexShrink: 1 },
});
