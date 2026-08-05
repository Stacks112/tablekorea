# citydata.js 통합 & 배포 절차

이 문서 하나로 끝나게 순서대로 따라가면 된다. 각 단계는 독립적으로 확인 가능.

## 0. 사전 준비

- `/root/tk/worker/` 안에 `index.js`, `wrangler.toml`, `citydata.js`(새로 추가된 파일)가 있는지 확인.
- `npx wrangler --version` 으로 wrangler CLI가 도는지 확인. 없으면 `npm install -g wrangler` 또는
  worker 디렉터리에서 `npx wrangler` (최초 실행 시 자동 설치됨).
- Cloudflare 계정 로그인이 안 되어 있으면 `npx wrangler login`.

## 1~2. index.js 배선 — ★ 이미 다 해뒀다

`import`, 라우팅 분기, `ALLOWED_ORIGINS` **세 가지 모두 `index.js`에 반영해서 커밋했다.**
june이 손댈 것이 없다. 확인만 하려면:

```bash
grep -n "handleCitydata\|stacks112" worker/index.js
```
세 줄(import 17행 · origins 21행 · 라우팅 76행)이 나오면 정상이다.

> **왜 미리 해뒀나**: 지난번엔 `ALLOWED_ORIGINS`의 github.io가 주석 처리된 채로 남아
> 배포 후 라이브에서 CORS로 막히는 사고가 예정돼 있었다. 사람이 기억해야 하는 단계를 없앴다.

## 3. D1 database_id가 placeholder라 배포가 막힐 때

`wrangler.toml`의 `database_id = "REPLACE-WITH-D1-ID"`가 실제 ID로 안 바뀌어 있으면
`wrangler deploy`가 실패한다. citydata 기능 자체는 D1을 쓰지 않으므로, D1을 아직
프로비저닝하지 않았다면 `[[d1_databases]]` 블록 전체를 주석 처리하고 배포해도 무방하다
(단, 그러면 `/feedback` 엔드포인트는 이 배포에서 죽는다 — citydata만 살리는 임시 조치):

```toml
# [[d1_databases]]
# binding = "DB"
# database_name = "tablekorea"
# database_id = "REPLACE-WITH-D1-ID"
```

나중에 `npx wrangler d1 create tablekorea`로 실제 ID를 받으면 다시 풀고 값 채워넣으면 됨.

## 4. 서울 API 키 등록 (secret)

`citydata.js`는 `env.SEOUL_API_KEY`를 읽는다. 코드에 키를 넣지 않았으므로 반드시
secret으로 등록해야 동작한다:

```bash
cd /root/tk/worker
npx wrangler secret put SEOUL_API_KEY
```

프롬프트가 뜨면 서울 열린데이터광장에서 발급받은 인증키를 붙여넣는다.
(이미 `IP_SALT` secret을 등록해뒀다면 이번엔 `SEOUL_API_KEY`만 추가하면 됨.)

## 5. 배포

```bash
cd /root/tk/worker
npx wrangler deploy
```

배포가 끝나면 터미널에 `https://tablekorea-api.<계정서브도메인>.workers.dev` 형태의
URL이 출력된다. 그 URL을 그대로 다음 단계에 쓴다.

## 6. 프런트 연결

`claude/app/bukjeok-seoul.html` (또는 실제 서빙 중인 프런트 파일)에서
Worker 베이스 URL을 정의하는 곳을 찾아 한 줄만 바꾸면 된다:

```js
const WORKER_BASE = "https://tablekorea-api.<계정서브도메인>.workers.dev";
```

프런트는 `${WORKER_BASE}/citydata/areas`를 호출해서 받은 `areas` 배열을 자기가 갖고 있는
120곳 정적 데이터(cd/nm/cat/lat/lng)와 `cd` 기준으로 merge하면 된다.
첫 호출은 최대 20곳만 채워진 부분 응답(`missing` 배열 참고)이 올 수 있으니, 프런트에서
몇 초 간격으로 `/citydata/areas`를 다시 불러서 캐시가 채워지는 대로 화면을 갱신하는 걸 권장.

## 7. 배포 확인 (curl 한 줄)

```bash
curl -s "https://tablekorea-api.<계정서브도메인>.workers.dev/citydata/area?cd=POI068" | head -c 500
```

`{"fetchedAt":...,"areas":[{"cd":"POI068",...}],"missing":[]}` 형태로 오면 정상.
`502`가 오면 `SEOUL_API_KEY`가 잘못됐거나 상류가 일시적으로 응답이 없는 것 — 몇 초 후 재시도.
`400 unknown cd`가 오면 `cd` 값이 화이트리스트(120개) 밖이라는 뜻이니 오타 확인.
