/**
 * Vercel Serverless Function: POST /api/coach
 * 앱에서 받은 대화 캡처 + 프로필을 Claude에 전달하고 구조화된 코칭 결과를 돌려줍니다.
 * 환경변수:
 *   ANTHROPIC_API_KEY 또는 GEMINI_API_KEY (둘 중 하나 필수. 둘 다 있으면 AI_PROVIDER 로 선택, 기본 anthropic)
 *   AI_PROVIDER = anthropic | gemini (선택), GEMINI_MODEL (선택, 기본 gemini-3.8-flash)
 *   COACH_APP_TOKEN (선택, 앱 토큰 검사)
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import {
  COACH_MODEL,
  COACH_SYSTEM_PROMPT,
  CoachAnalysisSchema,
  CoachRequestSchema,
  buildMessageContent,
  normalizeAnalysis,
} from '../src/lib/coach-schema';
import { callGemini } from '../src/lib/gemini';

export const config = { maxDuration: 120 };

function resolveProvider(): 'anthropic' | 'gemini' | null {
  const wanted = (process.env.AI_PROVIDER ?? '').toLowerCase();
  if (wanted === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  if (wanted === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다.' });
    return;
  }
  const provider = resolveProvider();
  if (!provider) {
    res.status(500).json({ error: '서버에 ANTHROPIC_API_KEY 또는 GEMINI_API_KEY가 설정되지 않았어요.' });
    return;
  }
  const expectedToken = process.env.COACH_APP_TOKEN;
  if (expectedToken && req.headers['x-app-token'] !== expectedToken) {
    res.status(401).json({ error: '앱 인증에 실패했어요.' });
    return;
  }

  const parsed = CoachRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: '요청 형식이 올바르지 않아요.', issues: parsed.error.issues.slice(0, 3) });
    return;
  }
  const coachReq = parsed.data;

  if (provider === 'gemini') {
    try {
      const result = await callGemini(coachReq, process.env.GEMINI_API_KEY!, { model: process.env.GEMINI_MODEL });
      if (!result.ok) {
        res.status(result.code === 'auth' ? 500 : result.code === 'rate_limit' ? 429 : result.code === 'refused' ? 422 : 502).json({ error: result.message });
        return;
      }
      const json = CoachAnalysisSchema.safeParse(JSON.parse(result.text));
      if (!json.success) {
        res.status(502).json({ error: '응답 형식이 올바르지 않아요. 다시 시도해주세요.' });
        return;
      }
      res.status(200).json({ analysis: normalizeAnalysis(json.data), usage: result.usage, provider });
    } catch {
      res.status(502).json({ error: 'AI 서버와 통신하지 못했어요.' });
    }
    return;
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: COACH_MODEL,
      max_tokens: 4096,
      system: [{ type: 'text', text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildMessageContent(coachReq) }],
      output_config: { effort: 'medium', format: zodOutputFormat(CoachAnalysisSchema) },
    });

    if (response.stop_reason === 'refusal') {
      res.status(422).json({ error: '이 대화는 코칭해드리기 어려워요. 다른 내용으로 시도해주세요.' });
      return;
    }
    if (!response.parsed_output) {
      res.status(502).json({ error: '응답을 이해하지 못했어요. 다시 시도해주세요.' });
      return;
    }
    res.status(200).json({
      analysis: normalizeAnalysis(response.parsed_output),
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      provider,
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      res.status(500).json({ error: '서버 API 키가 올바르지 않아요.' });
    } else if (error instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: '요청이 많아요. 잠시 후 다시 시도해주세요.' });
    } else if (error instanceof Anthropic.BadRequestError) {
      res.status(400).json({ error: `요청을 처리하지 못했어요: ${error.message}` });
    } else if (error instanceof Anthropic.APIError) {
      res.status(502).json({ error: `AI 서버 오류 (${error.status ?? 'unknown'})` });
    } else {
      res.status(500).json({ error: '알 수 없는 오류가 발생했어요.' });
    }
  }
}
