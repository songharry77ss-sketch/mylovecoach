-- 기한 있는 무제한 (2026-11-05) — 팀원 무제한에 끝나는 시각을 붙인다.
-- 비어 있으면 무기한(예전과 같음). 끝나는 시각이 지나면 /api/team 이 팀원이 아니라고 답하고,
-- 앱은 다음 확인(켤 때·돌아올 때·마이 탭) 때 무제한을 끈다. 여러 번 실행해도 안전하다.
alter table team_member add column if not exists expires_at timestamptz;
