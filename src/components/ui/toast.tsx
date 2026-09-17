import { createContext, useCallback, useContext, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing, palette } from '@/constants/theme';

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
  const bg = toast?.tone === 'success' ? palette.sky600 : toast?.tone === 'error' ? palette.pink600 : palette.gray800;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + 90 }]}>
          <Animated.View key={toast.id} entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(180)} style={[styles.toast, { backgroundColor: bg }]}>
            <AppText variant="smallStrong" color={palette.white} align="center">
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
  toast: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.pill, maxWidth: 420 },
});
