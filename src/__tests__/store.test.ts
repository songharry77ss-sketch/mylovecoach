import { buildHistory } from '@/store/app-store';
import type { ChatMessage, CoachAnalysis } from '@/lib/types';

const analysis = (summary: string, replies: string[] = []): CoachAnalysis => ({
  summary,
  temperature: 'warm',
  interestScore: 60,
  insights: [],
  replies: replies.map((text) => ({ tone: 'natural', text, why: '' })),
  nextStep: '',
  warnings: [],
});

const msg = (partial: Partial<ChatMessage> & Pick<ChatMessage, 'role'>): ChatMessage => ({
  id: Math.random().toString(36).slice(2),
  crushId: 'c1',
  createdAt: Date.now(),
  ...partial,
});

describe('buildHistory', () => {
  it('pairs user notes with coach summaries and chosen replies', () => {
    const list = [
      msg({ role: 'user', imageUri: 'file://a.jpg' }),
      msg({ role: 'coach', analysis: analysis('요약1', ['답장A', '답장B']), selectedReplyIndex: 1 }),
      msg({ role: 'user', text: '질문2' }),
      msg({ role: 'coach', pending: true }),
      msg({ role: 'user', text: '질문3' }),
      msg({ role: 'coach', error: '실패' }),
    ];
    const history = buildHistory(list);
    expect(history).toEqual([
      { userNote: '(대화 캡처 업로드)', coachSummary: '요약1', chosenReply: '답장B' },
      { userNote: '질문2' },
      { userNote: '질문3' },
    ]);
  });

  it('keeps only the most recent turns', () => {
    const list: ChatMessage[] = [];
    for (let i = 0; i < 10; i++) {
      list.push(msg({ role: 'user', text: `q${i}` }));
      list.push(msg({ role: 'coach', analysis: analysis(`s${i}`) }));
    }
    const history = buildHistory(list, 3);
    expect(history).toHaveLength(3);
    expect(history[0].userNote).toBe('q7');
  });
});
