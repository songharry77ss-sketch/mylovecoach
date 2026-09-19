import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * 키보드가 올라와 있는지 알려준다.
 * 키보드가 보이는 동안에는 하단 safe area 여백을 빼서 입력창이 키보드에 딱 붙게 하는 데 쓴다.
 */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // iOS 는 애니메이션이 시작될 때(will) 맞춰야 입력창이 키보드와 함께 움직인다
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subs = [
      Keyboard.addListener(showEvent, () => setVisible(true)),
      Keyboard.addListener(hideEvent, () => setVisible(false)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  return visible;
}
