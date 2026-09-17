/**
 * 연령대별 연락·연애 문화 참고 자료 (한국 2030 연애 리포트, 소개팅 커뮤니티 경험담, 연애 칼럼 종합).
 */
export type AgeBand = 'teen' | 'early20s' | 'late20s' | 'early30s' | 'late30s' | 'forties';

export interface AgeGuide {
  label: string;
  /** 말투·호칭·존댓말 */
  tone: string;
  /** 연락 빈도와 관계 진행 속도 */
  pace: string;
  /** 잘 통하는 대화 주제 */
  topics: string;
  /** 피할 것 */
  avoid: string;
  /** 약속 제안 방식 */
  dateIdea: string;
}

export const AGE_GUIDES: Record<AgeBand, AgeGuide> = {
  teen: {
    label: '10대 후반',
    tone: '반말·유행어·이모티콘이 자연스러움. 다만 상대가 존댓말이면 따라가기',
    pace: '연락 빈도가 곧 관심 척도로 읽히는 시기. 답장 텀이 길면 오해가 생기기 쉬움',
    topics: '학교·시험·취미·유튜브·게임·좋아하는 아이돌 등 일상 공유',
    avoid: '너무 진지하거나 무거운 미래 얘기, 부담스러운 선물, 늦은 밤 연락',
    dateIdea: '학교 근처 카페·분식·영화, 친구들과 함께하는 자리부터',
  },
  early20s: {
    label: '20대 초반',
    tone: '친해지면 빠르게 반말 전환. "ㅋㅋ"·이모티콘·밈 활용이 자연스럽고 텐션 있는 말투가 통함',
    pace: '접근성과 즉시성을 중시. 인스타 스토리·릴스 반응으로 시작하는 경우 많음. 관계 진행이 빠른 편',
    topics: '학교·알바·동아리·여행·핫플·인스타 감성·MBTI 이야기',
    avoid: '결혼·현실 조건 얘기, 훈계조, 과하게 격식 있는 문장, 답장 강요',
    dateIdea: '핫플 카페·팝업·전시·페스티벌, 즉흥적인 "지금 뭐해?" 제안도 OK',
  },
  late20s: {
    label: '20대 중후반',
    tone: '처음엔 가벼운 존댓말, 2~3번 만남 후 합의해서 반말. 유머와 진지함의 균형',
    pace: '직장·일정으로 답장 텀이 생김. 연락 빈도보다 연락의 질(기억·챙김)로 마음을 읽음',
    topics: '일·커리어 고민, 맛집·여행, 운동·자기계발, 주말 계획, 가치관 살짝',
    avoid: '학생 때 같은 과한 텐션 강요, 사생활 캐묻기, 첫 만남부터 조건 확인',
    dateIdea: '퇴근 후 저녁·와인바, 주말 브런치·전시, 계획된 하루 코스',
  },
  early30s: {
    label: '30대 초반',
    tone: '존댓말을 조금 더 오래 유지(소개팅이면 첫 만남까지는 꼭). 반말 전환은 "편하게 말해도 될까요?"처럼 물어보고',
    pace: '취향과 안정감이 기준. 상대가 "내 기준에 맞는지" 조용히 살피는 시기라 일관성이 중요. 답장 빠르고 장소를 상대 편한 곳으로 잡으면 호감 신호',
    topics: '일·삶의 방식, 취향(음악·영화·운동), 가치관·미래 방향, 가족 이야기 조금씩',
    avoid: '결혼 압박, 과거 연애 캐묻기, 가벼운 밀당·잠수, 술자리 위주 제안',
    dateIdea: '조용한 식당·카페에서 긴 대화, 취향 공유형 데이트(전시·클래스·산책)',
  },
  late30s: {
    label: '30대 후반',
    tone: '정중한 존댓말이 기본, 상대가 먼저 편하게 하자고 할 때 맞추기. 담백하고 신뢰감 있는 문장',
    pace: '연락은 잦지 않아도 꾸준함이 중요. 만남 자체를 진지하게 보는 경우가 많아 우유부단함이 큰 감점',
    topics: '일·건강·취미, 앞으로 원하는 삶의 모습, 서로의 리듬(주말 루틴 등)',
    avoid: '무례한 농담, 조건만 확인하는 질문, 연락 두절, 비교하는 말',
    dateIdea: '식사 중심의 차분한 만남, 산책·전시, 부담 없는 2~3시간 코스',
  },
  forties: {
    label: '40대 이상',
    tone: '존댓말과 예의가 기본. 짧고 명확하며 따뜻한 문장. 이모티콘은 절제',
    pace: '서두르지 않되 의사 표현은 분명하게. 약속·시간 약속을 잘 지키는 것이 최고의 호감 표현',
    topics: '건강·일·취미·여행, 살아온 이야기, 서로 편한 생활 리듬',
    avoid: '나이·과거를 굳이 언급, 가벼운 밀당, 늦은 밤 연락',
    dateIdea: '조용한 식당·산책·근교 나들이, 낮 시간 만남',
  },
};

export function ageBand(age?: number): AgeBand | null {
  if (!age || !Number.isFinite(age)) return null;
  if (age < 20) return 'teen';
  if (age < 25) return 'early20s';
  if (age < 30) return 'late20s';
  if (age < 35) return 'early30s';
  if (age < 40) return 'late30s';
  return 'forties';
}

export function ageGapNote(crushAge?: number, userAge?: number): string | null {
  if (!crushAge || !userAge) return null;
  const gap = crushAge - userAge;
  if (gap >= 4) return `상대가 ${gap}살 연상: 존댓말·호칭을 상대에게 맞추고, 어리광보다 어른스러운 여유와 배려가 통함. 나이 차를 화제로 삼지 말 것`;
  if (gap <= -4) return `상대가 ${-gap}살 연하: 훈계·가르치려는 말투 금지. 상대의 문화(밈·유행)를 억지로 따라하기보다 편하게 들어주는 태도`;
  return null;
}
