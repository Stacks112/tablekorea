# START HERE — 새 세션 진입점 (파일명 영구 고정)

읽기 순서:

1. 레포 루트 `CLAUDE.md` — 아키텍처·레인·규칙의 단일 진실 출처
2. `claude/status-*.md` 중 **가장 최근 파일** — 직전 세션이 한 일과 남은 일
3. 코드를 바꿀 파일은 **라이브 raw로 직접 읽고** 시작 (미러/사본 신뢰 금지)

절대 규칙:

- data/places.json과 index.html의 @PLACES 블록은 손편집 금지 — sync_data.py 경유
- p/, sitemap.xml은 Actions 전용 생성물
- 샘플 데이터 12곳은 가상 매장 — 실존 매장으로 오인시키는 변경 금지
- 세션 종료 시 status 문서를 **세션마다 고유한 파일명**으로 저장
  (`claude/status-YYYY-MM-DD-<주제>.md` — 프로젝트 문서는 통째 덮어쓰기라 같은 경로 재사용 금지)

현재 스냅샷 포인터: 프로젝트 문서 `claude/status-2026-07-30-tablekorea-prototype.md` 참조
