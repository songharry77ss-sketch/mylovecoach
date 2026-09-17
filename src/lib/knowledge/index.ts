import { AGE_GUIDES, ageBand, ageGapNote } from './age';
import { DIMENSION_NOTES, getMbtiProfile, pairDynamics } from './mbti';
import { STAGE_GUIDES } from './stage';

export interface KnowledgeInput {
  crush: { mbti?: string; age?: number; relationship: keyof typeof STAGE_GUIDES; gender: string };
  user: { mbti?: string; age?: number };
}

/**
 * 요청에 맞는 참고 자료만 골라 프롬프트에 넣습니다 (선택적 주입 = 경량 RAG).
 * 전체 자료를 매번 보내지 않으므로 토큰이 적고, 시스템 프롬프트는 고정되어 캐시에 유리합니다.
 */
export function retrieveKnowledge(input: KnowledgeInput): string {
  const sections: string[] = [];

  const crushProfile = getMbtiProfile(input.crush.mbti);
  if (crushProfile) {
    const m = (input.crush.mbti ?? '').toUpperCase();
    sections.push(
      [
        `[상대 MBTI ${m} 참고]`,
        `- 성향: ${crushProfile.vibe}`,
        `- 연락 패턴: ${crushProfile.texting}`,
        `- 끌리는 상대: ${crushProfile.attractedTo}`,
        `- 정 떨어지는 행동: ${crushProfile.turnOffs}`,
        `- 좋아할 때 신호: ${crushProfile.signals}`,
        `- 답장 전략: ${crushProfile.approach}`,
        `- 잘 먹히는 약속: ${crushProfile.dateIdea}`,
      ].join('\n'),
    );
  } else if (input.crush.mbti) {
    const letters = input.crush.mbti.toUpperCase().split('').filter((l): l is keyof typeof DIMENSION_NOTES => l in DIMENSION_NOTES);
    if (letters.length) sections.push(`[상대 성향 참고]\n${letters.map((l) => `- ${DIMENSION_NOTES[l]}`).join('\n')}`);
  }

  const userProfile = getMbtiProfile(input.user.mbti);
  if (userProfile) {
    sections.push(`[나(${(input.user.mbti ?? '').toUpperCase()})의 성향 참고]\n- ${userProfile.vibe}\n- 내 연락 습관: ${userProfile.texting}`);
  }

  const dynamics = pairDynamics(input.crush.mbti, input.user.mbti);
  if (dynamics.length) sections.push(`[두 사람의 조합]\n${dynamics.map((d) => `- ${d}`).join('\n')}`);

  const band = ageBand(input.crush.age);
  if (band) {
    const g = AGE_GUIDES[band];
    sections.push(
      [`[상대 연령대 ${g.label} 참고]`, `- 말투: ${g.tone}`, `- 속도: ${g.pace}`, `- 통하는 주제: ${g.topics}`, `- 피할 것: ${g.avoid}`, `- 약속: ${g.dateIdea}`].join('\n'),
    );
  }
  const gap = ageGapNote(input.crush.age, input.user.age);
  if (gap) sections.push(`[나이 차 참고]\n- ${gap}`);

  sections.push(`[관계 단계 참고]\n- ${STAGE_GUIDES[input.crush.relationship] ?? STAGE_GUIDES.talking}`);

  return sections.join('\n\n');
}

export { AGE_GUIDES, ageBand } from './age';
export { MBTI_PROFILES, getMbtiProfile, pairDynamics } from './mbti';
export { STAGE_GUIDES } from './stage';
