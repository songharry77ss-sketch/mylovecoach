import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { CardSection, ListGroup, useCardStyle } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { detectProvider } from '@/lib/coach-client';
import { APP_CONFIG } from '@/lib/config';
import { L } from '@/lib/i18n';
import { useAppStore } from '@/store/app-store';
import { loadApiKey, saveApiKey } from '@/store/storage';

/**
 * 마이 → AI 코치 연결. 1.2 개편: 옅은 회색 바탕 위 흰 카드 — 연결 상태 · 키 입력 · 발급 페이지.
 * 데모·개인 키 빌드에서만 앱 설정에 줄이 보인다(코치 서버에 연결된 스토어 빌드는 줄을 숨긴다 — settings/app).
 * 1.4 개편: 상태 카드의 색 아이콘 타일을 걷고 글자만.
 */
export default function ApiKeySettings() {
  const theme = useTheme();
  const card = useCardStyle();
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
      toast.show(L('Anthropic 키(sk-ant-…) 또는 Gemini 키(AIza… / AQ.…)를 넣어주세요.', 'Enter an Anthropic key (sk-ant-…) or a Gemini key (AIza… / AQ.…).'), 'error');
      return;
    }
    await saveApiKey(trimmed || null);
    setHasApiKey(Boolean(trimmed));
    toast.show(trimmed ? L('연결됐어요! 이제 코칭을 받을 수 있어요.', "You're connected! Coaching is ready.") : L('API 키를 삭제했어요.', 'API key removed.'), 'success');
    router.back();
  };

  const serverConnected = Boolean(APP_CONFIG.apiUrl || APP_CONFIG.apiSameOrigin);

  return (
    <Screen keyboard background={theme.canvas} contentStyle={styles.content}>
      {/* 머리말도 바탕과 같은 회색으로 */}
      <Stack.Screen options={{ headerStyle: { backgroundColor: theme.canvas } }} />
      <View style={[styles.status, card]}>
        <View style={styles.statusTexts}>
          <AppText variant="bodyStrong">{serverConnected ? L('코치 서버에 연결돼 있어요', 'Connected to the coach server') : L('개인 API 키로 연결하기', 'Connect with your own API key')}</AppText>
          <AppText variant="small" color="textSecondary">
            {serverConnected
              ? L(
                  '별도 설정 없이 바로 사용할 수 있어요. 코치 서버에 연결된 앱에서는 아래 개인 키를 등록해도 쓰이지 않아요.',
                  "It works right away — no setup needed. When the app is connected to the coach server, a personal key below won't be used.",
                )
              : L(
                  'Anthropic(Claude) 또는 Google Gemini 키를 넣으면 내 계정으로 코칭 요청이 이루어져요. 키는 기기의 보안 저장소(키체인)에만 저장돼요.',
                  'Add an Anthropic (Claude) or Google Gemini key to send coaching requests through your own account. The key is stored only in your device’s secure storage (Keychain).',
                )}
          </AppText>
        </View>
      </View>

      <CardSection title={L('개인 API 키', 'Personal API key')}>
        <TextField
          label={L('API 키 (Anthropic 또는 Gemini)', 'API key (Anthropic or Gemini)')}
          placeholder={L('sk-ant-... 또는 AQ.../AIza...', 'sk-ant-... or AQ.../AIza...')}
          value={key}
          onChangeText={setKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          editable={loaded}
          helper={
            detectProvider(key) === 'gemini'
              ? L('Google Gemini 키로 인식했어요.', 'Recognized as a Google Gemini key.')
              : detectProvider(key) === 'anthropic'
                ? L('Anthropic(Claude) 키로 인식했어요.', 'Recognized as an Anthropic (Claude) key.')
                : L('Anthropic: console.anthropic.com · Gemini: aistudio.google.com 에서 발급할 수 있어요.', 'Get one at console.anthropic.com (Anthropic) or aistudio.google.com (Gemini).')
          }
        />
      </CardSection>
      <Button title={L('저장', 'Save')} variant="brand" onPress={save} disabled={!loaded} />

      <ListGroup title={L('키 발급 페이지', 'Get an API key')}>
        <ListRow title={L('Anthropic 키 발급 페이지', 'Get an Anthropic key')} subtitle="console.anthropic.com" onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')} />
        <ListRow title={L('Gemini 키 발급 페이지', 'Get a Gemini key')} subtitle="aistudio.google.com" onPress={() => Linking.openURL('https://aistudio.google.com/apikey')} />
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.xl, paddingTop: Spacing.md },
  status: { borderRadius: Radius.lg, padding: Spacing.lg + 2 },
  statusTexts: { gap: 4 },
});
