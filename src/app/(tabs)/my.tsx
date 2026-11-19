import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BrandGradient } from '@/components/brand/brand';
import { AppText } from '@/components/ui/app-text';
import { ListGroup, useCardStyle, useInsetFill } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Brand, BrandShadow, Radius, Spacing, Typography } from '@/constants/theme';
import { onSalePrice, usePlanProducts } from '@/hooks/use-plan-products';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { providerLabel } from '@/lib/auth';
import { isUnlimited, useQuota } from '@/lib/billing/gate';
import { billingSupported } from '@/lib/billing/iap';
import { dateClock, PREMIUM_PLAN_NAMES, premiumUntilLabel, quotaLabel } from '@/lib/billing/quota';
import { refreshTeam } from '@/lib/billing/team';
import { isDemoMode } from '@/lib/demo';
import { haptic } from '@/lib/haptics';
import { genderLabel, toneLabel } from '@/lib/labels';
import { authAvailable } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';

/** 등장 순서 — 위에서부터 50ms 간격으로 살짝 올라온다 (홈과 같은 스프링, 움직임 줄이기 설정이면 reanimated 가 알아서 끈다) */
const enter = (step: number) => FadeInDown.delay(step * 50).springify().damping(18);

/**
 * 마이 (11/12 회의 4번 「내용이 너무 많다 → 큰 주제로 묶기」).
 * 첫 화면은 프로필 · 이용권 · 바로 쓰기(빠른 코칭 · 비밀 상담 · 연애 연습) · 큰 주제 4줄만.
 * 설정은 주제별 하위 화면으로 옮겼다 — 이용권·계정(settings/account) · 앱 설정(settings/app) · 개인정보(settings/data) · 도움말·정보(settings/help).
 */
export default function MyScreen() {
  const theme = useTheme();
  const card = useCardStyle();
  const pillFill = useInsetFill();
  const router = useRouter();
  const toast = useToast();
  const user = useAppStore((s) => s.user);
  const profileThin = !user?.name?.trim() && !user?.vibes?.length && !user?.goal && !user?.mbti;
  const crushCount = useAppStore((s) => Object.values(s.crushes).filter((c) => !c.secret).length);
  const premium = useAppStore((s) => s.premium);
  const wallet = useAppStore((s) => s.wallet);
  const team = useAppStore((s) => s.team);
  const member = useAppStore((s) => s.member);
  const appUpdate = useAppStore((s) => s.appUpdate);
  const aiConsent = useAppStore((s) => s.aiConsent);
  const hapticsOn = useAppStore((s) => s.hapticsOn);
  const practiceEnabled = useAppStore((s) => s.practiceEnabled);
  const practiceDotSeen = useAppStore((s) => s.practiceDotSeen);
  const setPracticeEnabled = useAppStore((s) => s.setPracticeEnabled);
  const createSecretChat = useAppStore((s) => s.createSecretChat);
  const quota = useQuota();
  // 「~부터」 가격은 스토어에서 확인된 가장 싼 상품으로만 적는다
  const products = usePlanProducts();
  const dayPrice = onSalePrice(products, 'day');
  const weeklyPrice = onSalePrice(products, 'weekly');
  const fromPrice = dayPrice ? `하루 ${dayPrice}부터` : weeklyPrice ? `주 ${weeklyPrice}부터` : undefined;

  // 관리자가 방금 팀원으로 등록했어도 마이 탭을 열면 바로 반영되도록
  useFocusEffect(
    useCallback(() => {
      refreshTeam().catch(() => {});
    }, []),
  );

  // 프리미엄이 실제로 이용 중일 때만 그 이름을 쓴다 (끝난 1년권·주간 구독이 저장돼 있어도 팀원·하루 이용권 이름이 가려지지 않게)
  const premiumOn = quota.kind === 'premium' && premium != null;
  const planValue = premiumOn ? PREMIUM_PLAN_NAMES[premium.plan] : quota.kind === 'team' ? '팀원 무제한' : quota.kind === 'pass' ? (quota.long ? '무제한 이용권' : '하루 이용권') : '';
  // 1년권: 「2027년 11월 7일까지」 (Android 는 어림한 날짜라 「… 끝날 예정」)
  const yearUntil = premiumOn ? premiumUntilLabel(premium) : null;
  const walletNote = wallet.credits > 0 ? `횟수권 ${wallet.credits}회` : '';
  // 산 이용권으로 무제한인지 — 「처음 5분」 무료 체험은 산 게 아니라서 「이용권 보기」 그대로 (남은 시간은 설명 줄에)
  const owned = isUnlimited(quota) && quota.kind !== 'intro';

  const profileInfo = [user && user.gender !== 'other' ? genderLabel(user.gender) : null, user?.age ? `${user.age}세` : null, user?.mbti].filter(Boolean).join(' · ');
  const tone = toneLabel(user?.defaultTone ?? 'natural');

  // 큰 주제 줄 — 오른쪽에 지금 상태를 짧게
  const hasBilling = quota.enforced && billingSupported;
  const accountTitle = hasBilling && authAvailable ? '이용권·계정' : hasBilling ? '이용권' : authAvailable ? '계정' : null;
  const accountValue = member ? `${providerLabel(member.provider)} 계정` : authAvailable ? '가입 전' : planValue || undefined;
  const privacyValue = isDemoMode ? undefined : aiConsent === true ? 'AI 동의함' : 'AI 동의 전';
  const helpValue = appUpdate ? '새 버전 있어요' : (Constants.expoConfig?.version ?? '1.0.0');

  const openSecret = () => {
    const id = createSecretChat();
    router.push({ pathname: '/crush/[id]', params: { id } });
  };
  // 연애 연습은 기본으로 숨겨 둔 탭 — 처음 누르면 켜고(빨간 점도 사라짐) 바로 연습 탭으로. 끄는 건 앱 설정에서
  const openPractice = () => {
    if (!practiceEnabled) {
      setPracticeEnabled(true);
      track('practice_toggle', { on: true });
      haptic.celebrate();
      toast.show('연애 연습을 켰어요. 아래 탭에도 생겼어요', 'success');
    }
    router.push('/(tabs)/practice');
  };

  return (
    <Screen safeTop tab title="마이" contentStyle={styles.content}>
      <Animated.View entering={enter(0)}>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          마이
        </Text>
      </Animated.View>

      {/* 아직 알려 준 게 없으면 코치와의 짧은 대화로 묻고, 있으면 고치는 화면으로 */}
      <Animated.View entering={enter(1)}>
        <PressableScale
          pressedScale={0.98}
          accessibilityLabel={user?.name ? `${user.name}, 내 프로필 고치기` : '나에 대해 알려주세요'}
          onPress={() => (profileThin ? router.push({ pathname: '/about-me', params: { from: 'my' } }) : router.push('/settings/profile'))}
          style={[styles.profile, card]}>
          <View style={styles.profileTop}>
            <BrandGradient style={styles.profileAvatar}>
              {user?.name?.trim() ? <Text style={styles.profileInitial}>{user.name.trim().slice(0, 1)}</Text> : <Ionicons name="person" size={26} color={Brand.onBrand} />}
            </BrandGradient>
            <View style={styles.profileTexts}>
              <AppText variant="title2" weight="800" numberOfLines={1}>
                {user?.name || '나에 대해 알려주세요'}
              </AppText>
              <AppText variant="small" color="textSecondary" numberOfLines={1}>
                {profileInfo || '알려 줄수록 「나다운」 답장이 나와요'}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </View>
          {/* 코칭에 쓰이는 내 정보 — 작은 알약으로 한눈에 */}
          <View style={styles.pills}>
            <ProfilePill icon="sparkles" fill={pillFill} label={user?.vibes?.length ? user.vibes.join(' · ') : `기본 톤 ${tone.label}`} />
            <ProfilePill icon="chatbubbles" fill={pillFill} label={`채팅방 ${crushCount}개`} />
            {user?.goal ? <ProfilePill icon="flag" fill={pillFill} label={`목표 · ${user.goal}`} /> : null}
          </View>
        </PressableScale>
      </Animated.View>

      {quota.enforced ? (
        <Animated.View entering={enter(2)}>
          {/* 이용권은 그라데이션 카드로 강조 — 남은 횟수와 가장 싼 가격을 바로 보여 준다 (화면의 그라데이션 큰 면은 이것 하나) */}
          <PressableScale
            feedback="thud"
            pressedScale={0.97}
            accessibilityLabel={owned ? `${planValue || '프리미엄'} 이용 중${yearUntil ? `, ${yearUntil}` : ''}` : `이용권 보기, ${quotaLabel(quota)}`}
            onPress={() => router.push({ pathname: '/paywall', params: { reason: 'my' } })}
            style={[styles.pass, BrandShadow]}>
            <BrandGradient style={styles.passFill}>
              <View style={styles.passTexts}>
                <Text style={styles.passTitle}>{owned ? `${planValue || '프리미엄'} 이용 중` : '이용권 보기'}</Text>
                <Text style={styles.passBody} numberOfLines={2}>
                  {quota.kind === 'team'
                    ? `관리자가 허용한 팀원 기기 · ${team?.label ?? '팀원'}`
                    : yearUntil
                      ? `${yearUntil} · 무제한`
                      : quota.kind === 'pass' && quota.long && quota.until
                        ? `${dateClock(quota.until)}까지 · 무제한`
                        : quotaLabel(quota)}
                  {owned && walletNote ? ` · ${walletNote}` : ''}
                </Text>
                {!owned && fromPrice ? (
                  <View style={styles.passChip}>
                    <Text style={styles.passChipText}>{fromPrice}</Text>
                  </View>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={Brand.onBrand} />
            </BrandGradient>
          </PressableScale>
        </Animated.View>
      ) : null}

      {/* 자주 쓰는 것 셋만 바로 — 연애 연습은 아직 안 켰으면 빨간 점 「새 기능」(11/12 회의 3번) */}
      <Animated.View entering={enter(3)}>
        <View style={[styles.quick, card]}>
          <QuickAction icon="flash" label="빠른 코칭" caption="복사한 대화로" onPress={() => router.push('/quick')} />
          <QuickAction icon="glasses" label="비밀 상담" caption="기록 안 남아요" onPress={openSecret} />
          <QuickAction icon="game-controller" label="연애 연습" caption={practiceEnabled ? '탭에서 이어서' : 'AI랑 리허설'} isNew={!practiceDotSeen} onPress={openPractice} />
        </View>
      </Animated.View>

      {/* 설정은 큰 주제 넷으로 묶어 하위 화면에서 */}
      <Animated.View entering={enter(4)}>
        <ListGroup>
          {accountTitle ? <ListRow icon="person-circle-outline" title={accountTitle} value={accountValue} onPress={() => router.push('/settings/account')} /> : null}
          <ListRow icon="options-outline" title="앱 설정" value={`진동 ${hapticsOn ? '켬' : '끔'}`} onPress={() => router.push('/settings/app')} />
          <ListRow icon="shield-checkmark-outline" title="개인정보" value={privacyValue} onPress={() => router.push('/settings/data')} />
          <ListRow icon="help-circle-outline" title="도움말·정보" value={helpValue} onPress={() => router.push('/settings/help')} />
        </ListGroup>
      </Animated.View>
    </Screen>
  );
}

/** 프로필 카드 안 작은 알약 — 코칭에 쓰이는 내 정보 */
function ProfilePill({ icon, label, fill }: { icon: keyof typeof Ionicons.glyphMap; label: string; fill: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: fill }]}>
      <Ionicons name={icon} size={12} color={theme.primary} />
      <AppText variant="caption" weight="700" color="textSecondary" numberOfLines={1} style={styles.pillText}>
        {label}
      </AppText>
    </View>
  );
}

/** 바로 쓰기 칸 하나 — 아이콘 · 이름 · 짧은 한 줄 (새 기능이면 그 줄이 빨간 점 「새 기능」) */
function QuickAction({ icon, label, caption, isNew, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; caption: string; isNew?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale pressedScale={0.94} onPress={onPress} accessibilityLabel={isNew ? `${label}, 새 기능` : `${label}, ${caption}`} style={styles.quickCell}>
      <View style={[styles.quickIcon, { backgroundColor: theme.primarySoft }]}>
        <Ionicons name={icon} size={22} color={theme.primary} />
      </View>
      <AppText variant="smallStrong" weight="700" numberOfLines={1}>
        {label}
      </AppText>
      {isNew ? (
        <View style={styles.newRow}>
          <View style={[styles.newDot, { backgroundColor: theme.danger }]} />
          <AppText variant="caption" weight="800" numberOfLines={1}>
            새 기능
          </AppText>
        </View>
      ) : (
        <AppText variant="caption" color="textTertiary" numberOfLines={1}>
          {caption}
        </AppText>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md },
  title: { ...Typography.hero, fontSize: 30, lineHeight: 38, marginTop: Spacing.sm, marginBottom: Spacing.xs, paddingHorizontal: Spacing.xs },
  profile: { borderRadius: Radius.lg + 2, padding: Spacing.lg + 2, gap: Spacing.md + 2 },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md + 2 },
  profileAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  profileInitial: { color: Brand.onBrand, fontSize: 23, lineHeight: 29, fontWeight: '900' },
  profileTexts: { flex: 1, gap: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.pill },
  pillText: { flexShrink: 1 },
  pass: { borderRadius: Radius.lg + 2 },
  passFill: { borderRadius: Radius.lg + 2, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg + 2, paddingLeft: Spacing.lg + 2, paddingRight: Spacing.lg },
  passTexts: { flex: 1, gap: 3 },
  passTitle: { color: Brand.onBrand, fontSize: 18, lineHeight: 24, fontWeight: '900', letterSpacing: -0.4 },
  passBody: { color: Brand.onBrandDim, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  passChip: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, backgroundColor: Brand.onBrand },
  passChipText: { color: Brand.blue, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  quick: { flexDirection: 'row', borderRadius: Radius.lg + 2, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xs },
  quickCell: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  quickIcon: { width: 46, height: 46, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  newDot: { width: 6, height: 6, borderRadius: 3 },
});
