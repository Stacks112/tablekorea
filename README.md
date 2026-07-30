# TableKorea (가칭)

방한 외국인 관광객을 위한 맛집 발견·결정 앱 — "한국인처럼 맛집을 고르게 해주는 앱".
여러 플랫폼의 한국어 리뷰를 AI로 요약·번역하고, 인원·상황별로 비교해서, 예약(캐치테이블
글로벌 딥링크)·길찾기로 연결한다. 현재 상태: **성수 프로토타입, 샘플 데이터 12곳(가상)**.

## june이 할 일 — 라이브까지 3단계 (약 15분)

1. **레포 만들기**: GitHub에서 public 레포 생성 (이름 예: `tablekorea`)
2. **업로드**: 이 폴더 전체를 "Upload files"로 업로드 (폴더 구조 유지, zip 풀어서)
3. **Pages 켜기**: Settings → Pages → Branch `main` / root → Save
   → 몇 분 뒤 `https://<계정>.github.io/tablekorea/` 에서 라이브 확인

이후는 Cowork 세션에 "레포 주소는 ○○야, 이어서 진행해줘"라고 알려주면 된다.

## 폴더 구조

```
index.html             앱 본체 (이 파일만 열어도 전체 동작)
data/places.json       매장 데이터 원본
scripts/               데이터 동기화 + SEO 페이지 빌드
p/ + sitemap.xml       매장별 SEO 페이지 (자동 생성)
worker/                Cloudflare Worker 골격 (피드백 API — 배포는 나중)
.github/workflows/     자동 빌드
CLAUDE.md              개발 세션용 규칙 (아키텍처 단일 진실 출처)
claude/START-HERE.md   새 세션 진입점
```

## 다음 마일스톤 (우선순위 순)

1. 서비스명 확정 + 도메인 구매 (Cloudflare Registrar, 연 ~$10)
2. 지도: 네이버 or 카카오 SDK 전환 (API 키 발급 필요)
3. 실데이터: 성수 실존 매장 20~30곳 (법적으로 안전한 3층 데이터 전략 — CLAUDE.md 참조)
4. Worker + D1 배포 (피드백 수집 시작)
5. 검색 등록 (Search Console + 서치어드바이저) — 도메인 확정과 같은 날

주의: 현재 매장 12곳은 전부 **가상 샘플 데이터**입니다. 실존 매장이 아니며,
외부 공유 시 이 표기를 유지해야 합니다.
