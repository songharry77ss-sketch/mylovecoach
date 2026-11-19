import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { CardSection } from '@/components/ui/list-group';
import { SubScreen } from '@/components/ui/sub-screen';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { couponSupported, normalizeCoupon, redeemCoupon } from '@/lib/billing/coupon';
import { quotaEnforced } from '@/lib/billing/gate';
import { haptic } from '@/lib/haptics';

/**
 * 쿠폰 코드 입력 (마이 → 이용권·계정 → 쿠폰 코드 · 이용권 화면 아래 「쿠폰 코드」 · 링크 /coupon?code=…).
 * 맞는 코드면 그 일수만큼 이 기기에서 무제한 (lib/billing/coupon). iOS 앱에서는 입력칸을 보여 주지 않는다.
 */
export default function CouponScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => (typeof params.code === 'string' ? normalizeCoupon(params.code) : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ days: number; label: string } | null>(null);

  useEffect(() => {
    track('coupon_open', { link: Boolean(params.code) });
  }, [params.code]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/my'));

  const submit = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    const result = await redeemCoupon(code);
    setBusy(false);
    if (!result.ok) {
      haptic.error();
      setError(result.message);
      return;
    }
    haptic.celebrate();
    setDone({ days: result.days, label: result.label });
    toast.show(`쿠폰 적용! ${result.days}일 동안 무제한이에요 🎁`, 'success');
  };

  if (!couponSupported) {
    return (
      <SubScreen title="쿠폰 코드">
        <CardSection>
          <AppText variant="body" color="textSecondary">
            {quotaEnforced ? '쿠폰은 웹과 Android 앱에서 쓸 수 있어요.' : '이 버전은 이미 무제한이라 쿠폰이 필요 없어요.'}
          </AppText>
        </CardSection>
      </SubScreen>
    );
  }

  if (done) {
    return (
      <SubScreen title="쿠폰 코드">
        <CardSection contentStyle={styles.done}>
          <View style={[styles.doneIcon, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name="gift" size={30} color={theme.primary} />
          </View>
          <AppText variant="title2" weight="800" align="center">
            {done.days}일 무제한을 받았어요
          </AppText>
          <AppText variant="body" color="textSecondary" align="center">
            {`${done.label}까지\n횟수 걱정 없이 마음껏 쓸 수 있어요.`}
          </AppText>
        </CardSection>
        <Button variant="primary" title="확인" onPress={back} />
      </SubScreen>
    );
  }

  return (
    <SubScreen title="쿠폰 코드">
      <CardSection footer="쿠폰마다 이 기기에서 한 번 쓸 수 있어요. 받은 무제한은 이 기기에만 적용돼요.">
        <TextField
          value={code}
          onChangeText={(text) => {
            setCode(text.toUpperCase());
            if (error) setError('');
          }}
          placeholder="쿠폰 코드 입력"
          accessibilityLabel="쿠폰 코드"
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={32}
          returnKeyType="done"
          onSubmitEditing={submit}
          error={error || undefined}
        />
      </CardSection>
      <Button variant="primary" title={busy ? '확인 중…' : '쿠폰 쓰기'} loading={busy} disabled={busy || !normalizeCoupon(code)} onPress={submit} />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  done: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
  doneIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
});
