import { useRouter } from 'expo-router';
import { Alert, Linking, Platform, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { genderLabel, toneLabel } from '@/lib/labels';
import { useAppStore } from '@/store/app-store';
import { saveApiKey } from '@/store/storage';

export default function MyScreen() {
  const router = useRouter();
  const toast = useToast();
  const user = useAppStore((s) => s.user);
  const hasApiKey = useAppStore((s) => s.hasApiKey);
  const resetAll = useAppStore((s) => s.resetAll);
  const crushCount = useAppStore((s) => Object.keys(s.crushes).length);

  const connection = isDemoMode ? '데모 모드 · 샘플 결과' : APP_CONFIG.apiUrl ? '연결됨 · 코치 서버' : hasApiKey ? '연결됨 · 내 API 키' : '연결 필요';

  const confirmReset = () => {
    const run = async () => {
      await saveApiKey(null);
      resetAll();
      toast.show('모든 데이터를 삭제했어요.');
      router.replace('/onboarding');
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('채팅방, 캡처, 프로필을 모두 삭제할까요? 되돌릴 수 없어요.')) run();
      return;
    }
    Alert.alert('모든 데이터 삭제', '채팅방, 캡처, 프로필을 모두 삭제할까요? 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <Screen safeTop>
      <AppText variant="display" style={styles.title}>
        마이
      </AppText>

      <Card tone="primary" onPress={() => router.push('/settings/profile')} style={styles.profile}>
        <Avatar name={user?.name ?? '나'} size={56} />
        <View style={styles.profileTexts}>
          <AppText variant="title3">{user?.name ?? '이름 없음'}</AppText>
          <AppText variant="small" color="textSecondary">
            {[user ? genderLabel(user.gender) : null, user?.age ? `${user.age}세` : null, user?.mbti].filter(Boolean).join(' · ') || '프로필을 채워보세요'}
          </AppText>
          <AppText variant="caption" color="primary">
            기본 톤 {toneLabel(user?.defaultTone ?? 'natural').emoji} {toneLabel(user?.defaultTone ?? 'natural').label} · 채팅방 {crushCount}개
          </AppText>
        </View>
      </Card>

      <SectionHeader title="AI 코치" />
      <ListRow icon="sparkles-outline" title="AI 코치 연결" value={connection} onPress={() => router.push('/settings/api-key')} />
      <ListRow icon="person-outline" title="내 프로필 수정" onPress={() => router.push('/settings/profile')} />

      <SectionHeader title="정보" />
      <ListRow icon="shield-checkmark-outline" title="개인정보 처리방침" onPress={() => Linking.openURL(APP_CONFIG.privacyUrl)} />
      <ListRow icon="document-text-outline" title="이용약관" onPress={() => Linking.openURL(APP_CONFIG.termsUrl)} />
      <ListRow icon="mail-outline" title="문의하기" subtitle={APP_CONFIG.supportEmail} onPress={() => Linking.openURL(`mailto:${APP_CONFIG.supportEmail}`)} />
      <ListRow icon="information-circle-outline" title="앱 버전" value={Constants.expoConfig?.version ?? '1.0.0'} />

      <SectionHeader title="데이터" subtitle="모든 데이터는 이 기기에만 저장돼요" />
      <ListRow icon="trash-outline" title="모든 데이터 삭제" destructive onPress={confirmReset} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: Spacing.sm, marginBottom: Spacing.lg },
  profile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  profileTexts: { flex: 1, gap: 2 },
});
