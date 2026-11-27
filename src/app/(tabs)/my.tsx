import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { ListGroup, useCardStyle, useInsetFill } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Brand, Radius, Spacing, Typography } from '@/constants/theme';
import { onSalePrice, usePlanProducts } from '@/hooks/use-plan-products';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { providerLabel } from '@/lib/auth';
import { isUnlimited, useQuota } from '@/lib/billing/gate';
import { billingSupported } from '@/lib/billing/iap';
import { dateClock, PREMIUM_PLAN_NAMES, formatPassEnd, premiumUntilLabel, quotaLabel } from '@/lib/billing/quota';
import { refreshTeam } from '@/lib/billing/team';
import { isDemoMode } from '@/lib/demo';
import { haptic } from '@/lib/haptics';
import { L } from '@/lib/i18n';
import { genderLabel, toneLabel } from '@/lib/labels';
import { authAvailable } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';

/** 등장 순서 — 위에서부터 50ms 간격으로 살짝 올라온다 (홈과 같은 스프링, 움직임 줄이기 설정이면 reanimated 가 알아서 끈다) */
const enter = (step: number) => FadeInDown.delay(step * 50).springify().damping(18);

/**
 * 마이 (11/12 회의 4번 「내용이 너무 많다 → 큰 주제로 묶기」).
 * 첫 화면은 이용권 상태판 · 프로필 · 바로 쓰기(빠른 코칭 · 비밀 상담 · 연애 연습) · 큰 주제 4줄만.
 * 설정은 주제별 하위 화면으로 옮겼다 — 이용권·계정(settings/account) · 앱 설정(settings/app) · 개인정보(settings/data) · 도움말·정보(settings/help).
 * 1.4 「깔끔하게」 개편: 옅은 바탕(canvas) + 흰 카드는 그대로, 그라데이션 이용권 카드·그라데이션 얼굴·아이콘 타일·반짝 칩을 걷었다.
 * 이용권은 맨 위 상태판으로(11/12 회의 10번 「구매 탭이 잘 안 보인다」) — 남은 무료 횟수나 이용 중인 이용권·끝나는 시각을 크게, 「이용권 보기」 파란 버튼 하나.
 */
export default function MyScreen() {
  const theme = useTheme();
  const card = useCardStyle();
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
  const practiceEnabled = useAppStore((s) => s.practiceEnabled);
  const practiceDotSeen = useAppStore((s) => s.practiceDotSeen);
  const setPracticeEnabled = useAppStore((s) => s.setPracticeEnabled);
  const createSecretChat = useAppStore((s) => s.createSecretChat);
  const quota = useQuota();
  // 「~부터」 가격은 스토어에서 확인된 가장 싼 상품으로만 적는다
  const products = usePlanProducts();
  const dayPrice = onSalePrice(products, 'day');
  const weeklyPrice = onSalePrice(products, 'weekly');
  const fromPrice = dayPrice ? L(`하루 ${dayPrice}부터`, `From ${dayPrice}/day`) : weeklyPrice ? L(`주 ${weeklyPrice}부터`, `From ${weeklyPrice}/week`) : undefined;

  // 관리자가 방금 팀원으로 등록했어도 마이 탭을 열면 바로 반영되도록
  useFocusEffect(
    useCallback(() => {
      refreshTeam().catch(() => {});
    }, []),
  );

  // 프리미엄이 실제로 이용 중일 때만 그 이름을 쓴다 (끝난 1년권·주간 구독이 저장돼 있어도 팀원·하루 이용권 이름이 가려지지 않게)
  const premiumOn = quota.kind === 'premium' && premium != null;
  const planValue = premiumOn
    ? PREMIUM_PLAN_NAMES[premium.plan]
    : quota.kind === 'team'
      ? L('팀원 무제한', 'Team unlimited')
      : quota.kind === 'pass'
        ? quota.long
          ? L('무제한 이용권', 'Unlimited pass')
          : L('하루 이용권', '24-hour pass')
        : '';
  // 1년권: 「2027년 11월 7일까지」 (Android 는 어림한 날짜라 「… 끝날 예정」)
  const yearUntil = premiumOn ? premiumUntilLabel(premium) : null;
  const walletNote = wallet.credits > 0 ? L(`횟수권 ${wallet.credits}회`, `${wallet.credits} ${wallet.credits === 1 ? 'credit' : 'credits'}`) : '';
  // 산 이용권으로 무제한인지 — 「처음 5분」 무료 체험은 산 게 아니라서 「이용권 보기」 그대로 (남은 시간은 설명 줄에)
  const owned = isUnlimited(quota) && quota.kind !== 'intro';

  const profileInfo = [user && user.gender !== 'other' ? genderLabel(user.gender) : null, user?.age ? L(`${user.age}세`, `Age ${user.age}`) : null, user?.mbti].filter(Boolean).join(' · ');
  const tone = toneLabel(user?.defaultTone ?? 'natural');
  // 코칭에 쓰이는 내 정보 — 예전 아이콘 알약 셋을 회색 한 줄로
  const profileExtra = [
    user?.vibes?.length ? L(`추구미 ${user.vibes.join(', ')}`, `Vibe: ${user.vibes.join(', ')}`) : L(`기본 톤 ${tone.label}`, `Tone: ${tone.label}`),
    L(`채팅방 ${crushCount}개`, `${crushCount} ${crushCount === 1 ? 'chat' : 'chats'}`),
    user?.goal ? L(`목표 ${user.goal}`, `Goal: ${user.goal}`) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // 큰 주제 줄 — 오른쪽에 지금 상태를 짧게 (뜻이 약한 「진동 켬」은 뺐다)
  const hasBilling = quota.enforced && billingSupported;
  const accountTitle = hasBilling && authAvailable ? L('이용권·계정', 'Passes & account') : hasBilling ? L('이용권', 'Passes') : authAvailable ? L('계정', 'Account') : null;
  const accountValue = member ? L(`${providerLabel(member.provider)} 계정`, `${providerLabel(member.provider)} account`) : authAvailable ? L('가입 전', 'Not signed up') : planValue || undefined;
  const privacyValue = isDemoMode ? undefined : aiConsent === true ? L('AI 동의함', 'AI: allowed') : L('AI 동의 전', 'AI: not yet');
  const helpValue = appUpdate ? L('새 버전 있어요', 'Update available') : (Constants.expoConfig?.version ?? '1.0.0');

  // 이용권 상태판 글 — 산 이용권이면 이름 + 끝나는 시각, 아니면 남은 무료 횟수(quotaLabel 의 앞 문장) + 나머지·가격
  const now = Date.now();
  const ownedDetail =
    quota.kind === 'team'
      ? { strong: '', rest: L(`관리자가 허용한 팀원 기기 · ${team?.label ?? '팀원'}`, `Team device approved by admin · ${team?.label ?? 'Team'}`) }
      : quota.kind === 'pass' && quota.until
        ? {
            strong: L(`${quota.long ? dateClock(quota.until) : formatPassEnd(quota.until, now)}까지`, `Until ${quota.long ? dateClock(quota.until) : formatPassEnd(quota.until, now)}`),
            rest: L(' · 무제한', ' · Unlimited'),
          }
        : yearUntil
          ? { strong: yearUntil, rest: L(' · 무제한', ' · Unlimited') }
          : { strong: '', rest: premium?.plan === 'weekly' ? L('무제한 · 매주 자동 결제', 'Unlimited · Renews weekly') : L('무제한', 'Unlimited') };
  const [quotaHead, ...quotaRest] = quotaLabel(quota).split(' · ');
  const freeDetail = [...quotaRest, fromPrice].filter(Boolean).join(' · ');
  const passLabel = owned
    ? L(
        `${planValue || '프리미엄'} 이용 중, ${ownedDetail.strong}${ownedDetail.rest}${walletNote ? ` · ${walletNote}` : ''}`,
        `${planValue || 'Premium'} active, ${ownedDetail.strong}${ownedDetail.rest}${walletNote ? ` · ${walletNote}` : ''}`,
      )
    : `${quotaHead}${freeDetail ? `, ${freeDetail}` : ''}`;
  const openPaywall = () => {
    haptic.thud();
    router.push({ pathname: '/paywall', params: { reason: 'my' } });
  };

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
      toast.show(L('연애 연습을 켰어요. 아래 탭에도 생겼어요', 'Practice chat is on. Find it in the tab bar too'), 'success');
    }
    router.push('/(tabs)/practice');
  };

  return (
    <Screen safeTop tab title={L('마이', 'Me')} contentStyle={styles.content}>
      <Animated.View entering={enter(0)}>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {L('마이', 'Me')}
        </Text>
      </Animated.View>

      {/* 이용권 상태판 — 흰 카드 + 파란 글자·버튼 하나 (색 면 없이) */}
      {quota.enforced ? (
        <Animated.View entering={enter(1)} style={[styles.pass, card]}>
          {owned ? (
            <>
              <View style={styles.passTexts} accessible accessibilityLabel={passLabel}>
                <AppText variant="smallStrong" color="primary">
                  {L('이용 중', 'Active')}
                </AppText>
                <AppText style={styles.passHead}>{planValue || L('프리미엄', 'Premium')}</AppText>
                <AppText variant="small" color="textSecondary">
                  {ownedDetail.strong ? (
                    <AppText variant="smallStrong" color="text">
                      {ownedDetail.strong}
                    </AppText>
                  ) : null}
                  {ownedDetail.rest}
                  {walletNote ? ` · ${walletNote}` : ''}
                </AppText>
              </View>
              {/* 이미 산 사람에게는 파란 글자 줄로 조용히 */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={L('이용권 보기', 'See passes')}
                onPress={openPaywall}
                style={({ pressed }) => [styles.passLink, { borderTopColor: theme.separator, opacity: pressed ? 0.6 : 1 }]}>
                <AppText variant="bodyStrong" color="primary" style={styles.flex}>
                  {L('이용권 보기', 'See passes')}
                </AppText>
                <Ionicons name="chevron-forward" size={16} color={theme.primary} />
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.passTexts} accessible accessibilityLabel={passLabel}>
                <AppText style={styles.passHead}>
                  <CountHighlight text={quotaHead} />
                </AppText>
                {freeDetail ? (
                  <AppText variant="small" color="textSecondary">
                    {freeDetail}
                  </AppText>
                ) : null}
              </View>
              <PressableScale feedback={false} pressedScale={0.98} accessibilityLabel={L('이용권 보기', 'See passes')} onPress={openPaywall} style={styles.passButton}>
                <Text style={styles.passButtonText}>{L('이용권 보기', 'See passes')}</Text>
              </PressableScale>
            </>
          )}
        </Animated.View>
      ) : null}

      {/* 아직 알려 준 게 없으면 코치와의 짧은 대화로 묻고, 있으면 고치는 화면으로 */}
      <Animated.View entering={enter(2)}>
        <PressableScale
          pressedScale={0.98}
          accessibilityLabel={user?.name ? L(`${user.name}, 내 프로필 고치기`, `${user.name}, edit my profile`) : L('나에 대해 알려주세요', 'Tell us about you')}
          onPress={() => (profileThin ? router.push({ pathname: '/about-me', params: { from: 'my' } }) : router.push('/settings/profile'))}
          style={[styles.profile, card]}>
          {user?.name?.trim() ? (
            <Avatar name={user.name.trim()} size={52} />
          ) : (
            <ProfileBlank />
          )}
          <View style={styles.profileTexts}>
            <AppText variant="title3" weight="700" numberOfLines={1}>
              {user?.name || L('나에 대해 알려주세요', 'Tell us about you')}
            </AppText>
            <AppText variant="small" color="textSecondary" numberOfLines={1}>
              {profileInfo || L('알려 줄수록 「나다운」 답장이 나와요', 'The more you share, the more the replies sound like you')}
            </AppText>
            <AppText variant="small" color="textSecondary" numberOfLines={2} style={styles.profileExtra}>
              {profileExtra}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
        </PressableScale>
      </Animated.View>

      {/* 자주 쓰는 것 셋만 바로 — 연애 연습은 아직 안 켰으면 빨간 점 「새 기능」(11/12 회의 3번). 아이콘은 타일 없이 회색 선 아이콘 */}
      <Animated.View entering={enter(3)}>
        <View style={[styles.quick, card]}>
          <QuickAction icon="flash-outline" label={L('빠른 코칭', 'Quick coach')} caption={L('복사한 대화로', 'From copied text')} onPress={() => router.push('/quick')} />
          <View style={[styles.quickDivider, { backgroundColor: theme.separator }]} />
          <QuickAction icon="glasses-outline" label={L('비밀 상담', 'Private chat')} caption={L('기록 안 남아요', 'Not saved')} onPress={openSecret} />
          <View style={[styles.quickDivider, { backgroundColor: theme.separator }]} />
          <QuickAction
            icon="chatbubbles-outline"
            label={L('연애 연습', 'Practice chat')}
            caption={practiceEnabled ? L('탭에서 이어서', 'Continue in tab') : L('AI랑 리허설', 'Rehearse with AI')}
            isNew={!practiceDotSeen}
            onPress={openPractice}
          />
        </View>
      </Animated.View>

      {/* 설정은 큰 주제 넷으로 묶어 하위 화면에서 */}
      <Animated.View entering={enter(4)}>
        <ListGroup>
          {accountTitle ? <ListRow title={accountTitle} value={accountValue} onPress={() => router.push('/settings/account')} /> : null}
          <ListRow title={L('앱 설정', 'App settings')} onPress={() => router.push('/settings/app')} />
          <ListRow title={L('개인정보', 'Privacy')} value={privacyValue} onPress={() => router.push('/settings/data')} />
          <ListRow title={L('도움말·정보', 'Help & about')} value={helpValue} onPress={() => router.push('/settings/help')} />
        </ListGroup>
      </Animated.View>
    </Screen>
  );
}

/** 「무료 코칭 2회 남았어요」의 「2회」만 파랑 — 화면의 핵심 숫자 (영어판은 「3 free sessions left」의 「3」) */
const COUNT_SPLIT = L(/(\d+회)/, /(\d+)/);
const COUNT_PART = L(/^\d+회$/, /^\d+$/);
function CountHighlight({ text }: { text: string }) {
  const parts = text.split(COUNT_SPLIT);
  return (
    <>
      {parts.map((part, i) =>
        COUNT_PART.test(part) ? (
          <AppText key={i} color="primary" style={styles.passHeadNumber}>
            {part}
          </AppText>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** 아직 이름을 모를 때의 얼굴 자리 — 회색 원 + 사람 선 아이콘 */
function ProfileBlank() {
  const theme = useTheme();
  const fill = useInsetFill();
  return (
    <View style={[styles.blank, { backgroundColor: fill }]}>
      <Ionicons name="person-outline" size={24} color={theme.textSecondary} />
    </View>
  );
}

/** 바로 쓰기 칸 하나 — 회색 선 아이콘 · 이름 · 짧은 한 줄 (새 기능이면 그 줄이 빨간 점 「새 기능」) */
function QuickAction({ icon, label, caption, isNew, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; caption: string; isNew?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale pressedScale={0.96} onPress={onPress} accessibilityLabel={isNew ? L(`${label}, 새 기능`, `${label}, new`) : `${label}, ${caption}`} style={styles.quickCell}>
      <Ionicons name={icon} size={22} color={theme.textSecondary} />
      <AppText variant="smallStrong" numberOfLines={1} style={styles.quickLabel}>
        {label}
      </AppText>
      {isNew ? (
        <View style={styles.newRow}>
          <View style={[styles.newDot, { backgroundColor: theme.danger }]} />
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {L('새 기능', 'New')}
          </AppText>
        </View>
      ) : (
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {caption}
        </AppText>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.md },
  // 1.4 개편: 가장 큰 제목 28 (탐색 탭과 같은 크기)
  title: { ...Typography.hero, marginTop: Spacing.sm, marginBottom: Spacing.xs, paddingHorizontal: Spacing.xs },
  pass: { borderRadius: Radius.lg, padding: Spacing.lg + 4, gap: Spacing.lg },
  passTexts: { gap: 4 },
  // 카드 안 큰 글자는 하나 — 남은 횟수나 이용 중인 이용권 이름
  passHead: { fontSize: 22, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5 },
  passHeadNumber: { fontSize: 22, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5 },
  passButton: { height: 50, borderRadius: 14, backgroundColor: Brand.blue, alignItems: 'center', justifyContent: 'center' },
  passButtonText: { color: Brand.onBrand, fontSize: 16, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3 },
  passLink: { flexDirection: 'row', alignItems: 'center', minHeight: 44, marginTop: -Spacing.xs, marginBottom: -Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  profile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md + 2, borderRadius: Radius.lg, padding: Spacing.lg + 2 },
  profileTexts: { flex: 1, gap: 2 },
  profileExtra: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  blank: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  quick: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs },
  quickDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: Spacing.md },
  quickCell: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: Spacing.md, borderRadius: Radius.md, minHeight: 88, justifyContent: 'center' },
  quickLabel: { marginTop: 2 },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  newDot: { width: 6, height: 6, borderRadius: 3 },
});
