/**
 * 안드로이드 기본 앱 이름(values/strings.xml 의 app_name)을 영어로 바꾼다 — 세계 출시(2026-11-27).
 * expo.name(「센딧」)은 iOS 프로젝트 이름에도 쓰여 바꿀 수 없으므로, 기본값만 영어로 두고
 * 한국어 기기는 expo-localization 의 locales/ko.json 이 만드는 values-ko/strings.xml(「센딧」)을 쓴다.
 * (iOS 는 한국어·영어 외 언어에서 개발 언어(en)의 InfoPlist.strings 로 돌아가 따로 할 일이 없다)
 */
const { AndroidConfig, withStringsXml } = require('expo/config-plugins');

module.exports = function withDefaultAppName(config, name = 'Love Coach') {
  return withStringsXml(config, (c) => {
    c.modResults = AndroidConfig.Strings.setStringItem([{ $: { name: 'app_name' }, _: name }], c.modResults);
    return c;
  });
};
