import { useColorScheme as useRNColorScheme } from 'react-native';

export type Scheme = 'light' | 'dark';

export function useColorScheme(): Scheme {
  const scheme = useRNColorScheme();
  return scheme === 'dark' ? 'dark' : 'light';
}
