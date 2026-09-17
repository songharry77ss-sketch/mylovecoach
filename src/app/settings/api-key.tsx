import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { detectProvider } from '@/lib/coach-client';
import { APP_CONFIG } from '@/lib/config';
import { useAppStore } from '@/store/app-store';
import { loadApiKey, saveApiKey } from '@/store/storage';

export default function ApiKeySettings() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const setHasApiKey = useAppStore((s) => s.setHasApiKey);
  const [key, setKey] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadApiKey().then((k) => {
      if (k) setKey(k);
      setLoaded(true);
    });
  }, []);

  const save = async () => {
    const trimmed = key.trim();
    if (trimmed && !detectProvider(trimmed)) {
      toast.show('Anthropic 키(sk-ant-…) 또는 Gemini 키(AIza… / AQ.…)를 넣어주세요.', 'error');
      return;
    }
    await saveApiKey(trimmed || null);
    setHasApiKey(Boolean(trimmed));
    toast.show(trimmed ? '연결됐어요! 이제 코칭을 받을 수 있어요.' : 'API 키를 삭제했어요.', 'success');
    router.back();
  };

  return (
    <Screen keyboard contentStyle={styles.content}>
      {APP_CONFIG.apiUrl || APP_CONFIG.apiSameOrigin ? (
        <Card tone="primary" style={styles.status}>
          <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
          <View style={styles.statusTexts}>
            <AppText variant="bodyStrong">코치 서버에 연결돼 있어요</AppText>
            <AppText variant="small" color="textSecondary">
              별도 설정 없이 바로 사용할 수 있어요. 아래 개인 키는 서버가 응답하지 않을 때만 쓰여요.
            </AppText>
          </View>
        </Card>
      ) : (
        <Card tone="accent" style={styles.status}>
          <Ionicons name="key" size={22} color={theme.accent} />
          <View style={styles.statusTexts}>
            <AppText variant="bodyStrong">개인 API 키로 연결하기</AppText>
            <AppText variant="small" color="textSecondary">
              Anthropic(Claude) 또는 Google Gemini 키를 넣으면 내 계정으로 코칭 요청이 이루어져요. 키는 기기의 보안 저장소(키체인)에만 저장돼요.
            </AppText>
          </View>
        </Card>
      )}

      <TextField
        label="API 키 (Anthropic 또는 Gemini)"
        placeholder="sk-ant-... 또는 AQ.../AIza..."
        value={key}
        onChangeText={setKey}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        editable={loaded}
        helper={
          detectProvider(key) === 'gemini'
            ? 'Google Gemini 키로 인식했어요.'
            : detectProvider(key) === 'anthropic'
              ? 'Anthropic(Claude) 키로 인식했어요.'
              : 'Anthropic: console.anthropic.com · Gemini: aistudio.google.com 에서 발급할 수 있어요.'
        }
      />
      <Button title="저장" onPress={save} disabled={!loaded} />
      <Button title="Anthropic 키 발급 페이지" variant="ghost" onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')} />
      <Button title="Gemini 키 발급 페이지" variant="ghost" onPress={() => Linking.openURL('https://aistudio.google.com/apikey')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.xl, paddingTop: Spacing.lg },
  status: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  statusTexts: { flex: 1, gap: 4 },
});
