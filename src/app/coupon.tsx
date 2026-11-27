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
import { L } from '@/lib/i18n';

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
    toast.show(L(`쿠폰 적용! ${result.days}일 동안 무제한이에요 🎁`, `Coupon applied! Unlimited for ${result.days} ${result.days === 1 ? 'day' : 'days'} 🎁`), 'success');
  };

  if (!couponSupported) {
    return (
      <SubScreen title={L('쿠폰 코드', 'Coupon code')}>
        <CardSection>
          <AppText variant="body" color="textSecondary">
            {quotaEnforced
              ? L('쿠폰은 웹과 Android 앱에서 쓸 수 있어요.', 'Coupons work on the web and the Android app.')
              : L('이 버전은 이미 무제한이라 쿠폰이 필요 없어요.', "This version is already unlimited — no coupon needed.")}
          </AppText>
        </CardSection>
      </SubScreen>
    );
  }

  if (done) {
    return (
      <SubScreen title={L('쿠폰 코드', 'Coupon code')}>
        <CardSection contentStyle={styles.done}>
          <View style={[styles.doneIcon, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name="gift" size={30} color={theme.primary} />
          </View>
          <AppText variant="title2" weight="800" align="center">
            {L(`${done.days}일 무제한을 받았어요`, `You got ${done.days} ${done.days === 1 ? 'day' : 'days'} unlimited`)}
          </AppText>
          <AppText variant="body" color="textSecondary" align="center">
            {L(`${done.label}까지\n횟수 걱정 없이 마음껏 쓸 수 있어요.`, `Use it as much as you want\nuntil ${done.label}.`)}
          </AppText>
        </CardSection>
        <Button variant="primary" title={L('확인', 'Done')} onPress={back} />
      </SubScreen>
    );
  }

  return (
    <SubScreen title={L('쿠폰 코드', 'Coupon code')}>
      <CardSection footer={L('쿠폰마다 이 기기에서 한 번 쓸 수 있어요. 받은 무제한은 이 기기에만 적용돼요.', 'Each coupon works once per device. Unlimited access applies to this device only.')}>
        <TextField
          value={code}
          onChangeText={(text) => {
            setCode(text.toUpperCase());
            if (error) setError('');
          }}
          placeholder={L('쿠폰 코드 입력', 'Enter coupon code')}
          accessibilityLabel={L('쿠폰 코드', 'Coupon code')}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={32}
          returnKeyType="done"
          onSubmitEditing={submit}
          error={error || undefined}
        />
      </CardSection>
      <Button variant="primary" title={busy ? L('확인 중…', 'Checking…') : L('쿠폰 쓰기', 'Redeem')} loading={busy} disabled={busy || !normalizeCoupon(code)} onPress={submit} />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  done: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
  doneIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
});
