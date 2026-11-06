/**
 * 「센딧 사용법」 안내의 장마다 보여 줄 실제 앱 화면과 강조 위치.
 *
 * 그림을 바꾸는 법 (화면 개편이 끝난 뒤 데모 서버에서 다시 찍어 넣는다):
 * 1. assets/images/guide/step-N.png 를 같은 이름으로 덮어쓴다 — 아이폰 393×852 화면을 2배(786×1704)로,
 *    상태 표시줄·홈 막대까지 한 화면 그대로. 한 장 300KB 안팎 (넘으면 JPG 로 바꾸고 아래 require 이름도 바꾼다).
 * 2. 크기가 다르면 아래 SHOT_WIDTH·SHOT_HEIGHT(비율만 쓴다)와 STATUS_BAR 를 맞춘다.
 * 3. 장마다 crop(틀 안에 보일 세로 범위), spots(누르는 곳 — 점), boxes(보는 곳 — 상자)를 그림에 맞춘다.
 *    좌표는 모두 그림 전체 기준 0~1 비율: 「픽셀 위치 ÷ 그림 가로(세로) 크기」. 예: 786×1704 그림의 (393, 640) → x 0.5, y 0.376.
 *    crop 범위가 좁을수록 휴대폰이 크게 보인다 (세로 0.55~0.65 범위면 카드 폭의 70% 안팎).
 */
import type { ImageSourcePropType } from 'react-native';

/** 그림의 픽셀 크기 (가로 · 세로) — 화면 비율만 쓴다 */
export const SHOT_WIDTH = 786;
export const SHOT_HEIGHT = 1704;
/** 그림 맨 위 상태 표시줄(시계·배터리) 높이 — 그림 높이 대비 (아이폰 59 / 852) */
export const STATUS_BAR = 59 / 852;

export interface GuideSpot {
  /** 누르는 곳의 가로 위치 — 그림 전체 기준 0(왼쪽) ~ 1(오른쪽) */
  x: number;
  /** 누르는 곳의 세로 위치 — 그림 전체 기준 0(위) ~ 1(아래) */
  y: number;
  /** 점 옆에 붙는 짧은 말 (예: 「여기를 눌러요」) */
  label?: string;
  /** 말이 붙는 쪽 (기본 오른쪽) */
  side?: 'left' | 'right' | 'top' | 'bottom';
}

/** 보는 곳 — 누르는 곳이 아니라 「여기를 보세요」 하고 둘러 강조하는 영역 (성공 확률·호감 온도 같은 숫자) */
export interface GuideBox {
  /** 왼쪽 위 모서리 — 그림 전체 기준 비율 */
  x: number;
  y: number;
  /** 가로·세로 크기 — 그림 전체 기준 비율 */
  w: number;
  h: number;
  /** 상자 위(아래)에 붙는 짧은 말 */
  label?: string;
  side?: 'top' | 'bottom';
}

export interface GuideShot {
  image: ImageSourcePropType;
  width: number;
  height: number;
  /**
   * 휴대폰 틀 안에 보일 세로 범위 — 그림 높이 대비 0~1. 이 범위가 카드 안에 다 들어오도록 휴대폰 크기를 맞춘다.
   * top 이 0 보다 크면 그만큼 내린 화면을 보여 주되 상태 표시줄은 위에 그대로 붙인다.
   */
  crop: { top: number; bottom: number };
  /** 누르는 곳 (반짝이는 원 + 짧은 말). 보는 곳(boxes) 다음에 차례로 나타난다 */
  spots: GuideSpot[];
  /** 보는 곳 (둘러 강조하는 상자 + 짧은 말, 선택) */
  boxes?: GuideBox[];
}

export interface GuideStep {
  key: 'capture' | 'replies' | 'mind' | 'memory';
  /** 제목 위 작은 칩 */
  pill: string;
  /** 큰 제목 (한두 줄) */
  title: string;
  body: string;
  shot: GuideShot;
}

const shot = (image: ImageSourcePropType, rest: Omit<GuideShot, 'image' | 'width' | 'height'>): GuideShot => ({ image, width: SHOT_WIDTH, height: SHOT_HEIGHT, ...rest });

export const GUIDE_STEPS: GuideStep[] = [
  {
    key: 'capture',
    pill: '1 · 캡처 올리기',
    title: '카톡 캡처 한 장 올리기',
    body: '답장이 고민되는 대화를 캡처해서 올려요. 캡처가 없으면 상황만 적어도 돼요.',
    // 홈 — 「캡처 올리기」 버튼과 「상황만 적기」 칸
    shot: shot(require('../../../assets/images/guide/step-1.png'), {
      crop: { top: 0.285, bottom: 0.79 },
      spots: [
        { x: 0.74, y: 0.527, label: '여기를 눌러요', side: 'bottom' },
        { x: 0.8, y: 0.737, label: '상황만 적어도 돼요', side: 'bottom' },
      ],
    }),
  },
  {
    key: 'replies',
    pill: '2 · 답장 고르기',
    title: '답장 3가지 중 골라 복사',
    body: '내 말투를 살린 답장 3가지를 성공 확률과 함께 보여 줘요. 마음에 드는 걸 누르면 복사돼요.',
    // 채팅방 — 답장 카드의 성공 확률과 「복사」
    shot: shot(require('../../../assets/images/guide/step-2.png'), {
      crop: { top: 0, bottom: 0.62 },
      boxes: [{ x: 0.6, y: 0.338, w: 0.355, h: 0.048, label: '성공 확률', side: 'top' }],
      spots: [{ x: 0.809, y: 0.491, label: '누르면 복사', side: 'bottom' }],
    }),
  },
  {
    key: 'mind',
    pill: '3 · 마음 읽기',
    title: '속마음과 호감 온도까지',
    body: '대화를 올릴 때마다 호감 온도가 오르내리고, 그 사람이 관심 있을 가능성도 짚어 줘요.',
    // 채팅방 — 머리의 호감 온도와 결과의 관심 있을 가능성
    shot: shot(require('../../../assets/images/guide/step-3.png'), {
      crop: { top: 0, bottom: 0.62 },
      boxes: [
        { x: 0.235, y: 0.104, w: 0.27, h: 0.034, label: '호감 온도', side: 'bottom' },
        { x: 0.075, y: 0.463, w: 0.885, h: 0.092, label: '그 사람 마음', side: 'top' },
      ],
      spots: [],
    }),
  },
  {
    key: 'memory',
    pill: '4 · 기억',
    title: '지난 대화도 센딧이 기억해요',
    body: '나눈 이야기를 「센딧이 기억하는 이야기」에 모아 두고, 다음 답장에 살려 줘요.',
    // 채팅방 맨 위 — 「센딧이 기억하는 이야기」
    shot: shot(require('../../../assets/images/guide/step-4.png'), {
      crop: { top: 0, bottom: 0.5 },
      spots: [{ x: 0.86, y: 0.182, label: '눌러서 보기', side: 'bottom' }],
    }),
  },
];
