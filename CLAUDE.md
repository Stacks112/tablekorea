# TableKorea (가칭) — 레포 단일 진실 출처

방한 외국인 관광객용 맛집 발견·결정 앱. 이 문서가 아키텍처·워크플로의 정답이다.
프로젝트 문서(claude.ai Projects)와 내용이 다르면 **이 파일이 이긴다**.

## 항상 지킬 것

- 사용자(june)에게는 **한국어로** 응답한다. 앱 UI 텍스트는 EN/JA/ZH(번체).
- 새 세션은 `claude/START-HERE.md`부터 읽는다.
- 세션 종료 시: 아키텍처가 바뀌었으면 이 파일 갱신 → 프로젝트에 status 문서 저장.

## 아키텍처

```
index.html            앱 본체 (단일 파일, GitHub Pages 서빙)
data/places.json      매장 데이터의 canonical 원본 ★단일 작성자: 데이터 파이프라인만 수정
scripts/sync_data.py  places.json → index.html 앵커 블록(@PLACES_START/END) 주입
scripts/build_pages.py p/<id>.html SEO 페이지 + sitemap.xml 생성
p/*.html, sitemap.xml 생성물 — 손으로 편집 금지 (Actions 전용)
worker/               Cloudflare Worker (피드백 API). D1 바인딩: DB
.github/workflows/    build.yml — places.json 변경 시 sync + build + 자동 커밋
```

- 지도: 현재 자체 SVG 약도. **실서비스 전환 시 네이버/카카오 SDK로 교체 예정** (API 키 필요 — june 계정).
- i18n: index.html 안 I18N 객체 (EN/JA/ZH). 새 UI 문자열은 반드시 3개 언어 모두 추가.
- 매장 딥링크: `/?place=<id>` → 상세 시트 자동 오픈. SEO 페이지가 이 형식으로 리다이렉트.

## 경로당 작성자 (레인)

| 레인 | 경로 | 작성자 |
|---|---|---|
| 프론트 | index.html (데이터 블록 제외) | 개발 세션 |
| 데이터 | data/places.json + @PLACES 블록 | 데이터 파이프라인/세션 하나 |
| 생성물 | p/, sitemap.xml | GitHub Actions만 |
| 백엔드 | worker/ | 개발 세션 |
| 문서 | claude/, CLAUDE.md | 해당 작업 세션 |

## 데이터 규칙 (중요 — 법적 리스크)

- 현재 12곳은 **전부 가상 샘플**. 실존 매장 아님. 외부 공유 시 표기 유지.
- 실데이터 전환 시: 대규모 리뷰 크롤링 금지. 3층 전략만 사용
  ① 공개 API·제휴 데이터 ② 출처 명시한 공개 콘텐츠 요약 ③ 자체 수집 속성·자체 리뷰.
- AI 요약에는 항상 출처 표기(`ai_src`)를 유지한다.

## 검증 루틴 (배포 전 필수)

1. 로컬 Playwright 렌더: 모바일 390×844 + 데스크톱 1280
2. JS 에러 0 확인 (pageerror + console.error)
3. 3개 언어 각각 목록·상세·비교 화면 1회씩
4. 배포 후 라이브 raw sha 대조

## 미결정/보류

- 서비스명 (TableKorea는 가칭) · 도메인 미구매 (`scripts/build_pages.py`의 BASE가 placeholder)
- Worker 미배포 (wrangler.toml의 database_id placeholder)
- Catchtable Global 딥링크: 실매장 데이터 확보 후 실제 URL 매핑
