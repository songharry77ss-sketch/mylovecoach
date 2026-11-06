import { Platform, Switch as RNSwitch, type SwitchProps } from 'react-native';

import { palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 센딧 색 스위치 — react-native 의 Switch 와 같은 props.
 * 기본 색이 기기마다 달라(아이폰 초록, 웹 청록) 앱과 안 맞으므로 켜짐은 파랑(primary), 꺼짐은 옅은 회색, 손잡이는 흰색으로 맞춘다.
 * trackColor·thumbColor 를 넘기면 그 값이 이긴다.
 */
export function Switch({ trackColor, thumbColor, ios_backgroundColor, ...rest }: SwitchProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const off = scheme === 'dark' ? theme.surfaceSelected : palette.gray300;
  const thumb = thumbColor ?? palette.white;
  // 웹(react-native-web)은 켜졌을 때 손잡이 색을 activeThumbColor 로 따로 받는다 (기본 초록)
  const web = Platform.OS === 'web' ? ({ activeThumbColor: thumb, activeTrackColor: trackColor?.true ?? theme.primary } as object) : null;
  return (
    <RNSwitch
      trackColor={{ false: trackColor?.false ?? off, true: trackColor?.true ?? theme.primary }}
      thumbColor={thumb}
      ios_backgroundColor={ios_backgroundColor ?? off}
      {...web}
      {...rest}
    />
  );
}
