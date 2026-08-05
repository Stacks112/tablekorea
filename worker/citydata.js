/**
 * 서울 열린데이터광장 "실시간 도시데이터" 프록시.
 *
 * 왜 필요한가 (index.js 상단 주석과 같은 톤으로):
 *  - 상류가 http://openapi.seoul.go.kr:8088 라서 mixed content로 브라우저에서 직접 못 부름
 *  - 인증키가 URL 경로 세그먼트에 박히는 구조라 프런트에 그대로 두면 키가 노출됨
 *  - 상류가 POI 1개씩만 조회 가능 → 120곳 전체를 한 요청으로 훑으면
 *    Cloudflare 무료 플랜의 요청당 서브리퀘스트 50개 한도를 넘는다.
 *    (KV는 계정에 없음 — 프로비저닝 단계를 늘리지 않으려고 의도적으로 안 씀)
 *    → caches.default(Cache API)로 POI 단위 캐싱 + 배치당 20곳으로 잘라서 상류를 부르고,
 *      나머지는 missing 배열에 담아 200으로 "부분 응답"한다.
 *      빈 화면보다 한 지역이라도 그려지는 게 낫다는 제품 판단.
 */

// poi_list.json의 120개 코드만 화이트리스트로 허용한다.
// 정규식(/POI\d+/ 등)으로 대신하면 상류 API에 임의 코드를 흘려보내는
// 오픈 프록시가 되어버리므로 반드시 고정 목록으로 막는다.
const ALLOWED_POI_CODES = new Set([
  "POI001", "POI004", "POI002", "POI003", "POI008", "POI005", "POI007", "POI006",
  "POI011", "POI012", "POI010", "POI009", "POI015", "POI016", "POI013", "POI014",
  "POI020", "POI018", "POI019", "POI017", "POI024", "POI023", "POI021", "POI025",
  "POI029", "POI026", "POI027", "POI030", "POI031", "POI032", "POI034", "POI033",
  "POI036", "POI038", "POI035", "POI037", "POI040", "POI042", "POI039", "POI041",
  "POI043", "POI046", "POI045", "POI044", "POI049", "POI048", "POI047", "POI050",
  "POI054", "POI051", "POI053", "POI052", "POI056", "POI058", "POI055", "POI059",
  "POI060", "POI063", "POI061", "POI064", "POI067", "POI066", "POI068", "POI070",
  "POI074", "POI073", "POI071", "POI072", "POI077", "POI076", "POI078", "POI079",
  "POI080", "POI082", "POI081", "POI083", "POI085", "POI086", "POI087", "POI084",
  "POI090", "POI089", "POI088", "POI091", "POI092", "POI095", "POI093", "POI094",
  "POI096", "POI098", "POI100", "POI101", "POI103", "POI102", "POI105", "POI104",
  "POI108", "POI107", "POI106", "POI109", "POI111", "POI112", "POI110", "POI114",
  "POI118", "POI115", "POI117", "POI116", "POI122", "POI121", "POI119", "POI120",
  "POI126", "POI125", "POI123", "POI124", "POI128", "POI130", "POI129", "POI127",
]);

const CACHE_TTL_SEC = 300;
const MAX_UPSTREAM_PER_REQUEST = 20; // 서브리퀘스트 50개 한도 안에서 여유를 두고 자른 값
const UPSTREAM_TIMEOUT_MS = 8000; // 한 곳이 느려도 전체 응답이 물리지 않게

// 상류가 주는 혼잡도 표기가 "여유"/"약간 붐빔"/"매우 붐빔" 등으로 흔들리고
// 공백 유무도 일정하지 않아서, 공백 제거 후 매칭한다.
const CONGEST_LEVEL_MAP = {
  "여유": 0,
  "보통": 1,
  "약간붐빔": 2,
  "붐빔": 3,
  "매우붐빔": 3, // 상류 표기 흔들림 대비 (약간 붐빔/붐빔 2단계만 문서화돼 있으나 방어적으로 매핑)
};

// 도로 소통 상태도 마찬가지로 한글 문자열 → 정수.
const ROAD_LEVEL_MAP = {
  "원활": 0,
  "서행": 1,
  "정체": 2,
};

function mapCongestLevel(raw, cdForLog) {
  if (!raw) return null;
  const key = String(raw).replace(/\s+/g, "");
  const mapped = CONGEST_LEVEL_MAP[key];
  if (mapped === undefined) {
    // 매핑 실패는 조용히 넘기지 않는다 — 원인 파악용으로 로그만 남기고 null 반환.
    console.log(`[citydata] unknown congest level "${raw}" (cd=${cdForLog})`);
    return null;
  }
  return mapped;
}

function mapRoadLevel(raw, cdForLog) {
  if (!raw) return null;
  const key = String(raw).replace(/\s+/g, "");
  const mapped = ROAD_LEVEL_MAP[key];
  if (mapped === undefined) {
    console.log(`[citydata] unknown road level "${raw}" (cd=${cdForLog})`);
    return null;
  }
  return mapped;
}

function toNumberOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 캐시 API는 절대 URL을 키로 쓴다. 실제 존재하는 도메인일 필요는 없고
// 이 Worker 내부에서만 참조하는 네임스페이스면 된다.
function cacheKeyFor(cd) {
  return new URL(`https://cache.local/citydata/${cd}`);
}

/**
 * 상류 응답 1건을 프런트 스키마의 area 객체로 변환한다.
 * 프런트가 이미 lat/lng/cat을 정적으로 갖고 있으므로 좌표는 절대 반환하지 않는다.
 */
function normalizeUpstream(cd, data) {
  // 실제 서울시 citydata API는 최상위가 "CITYDATA"이고 SeoulRtd 래퍼가 없는 것으로
  // 알려져 있으나, 컨테이너 환경이 외부망 차단이라 실호출 검증이 불가능하다.
  // 두 형태 모두 방어적으로 받는다.
  const cityData = data?.CITYDATA ?? data?.SeoulRtd?.CITYDATA;
  const row = cityData?.LIVE_PPLTN_STTS?.[0];
  if (!row) return null;

  const fc = Array.isArray(row.FCST_PPLTN)
    ? row.FCST_PPLTN.map((f) => mapCongestLevel(f.FCST_CONGEST_LVL, cd))
    : [];

  const roadRaw = cityData?.ROAD_TRAFFIC_STTS?.AVG_ROAD_DATA?.ROAD_TRAFFIC_IDX;
  const weather = cityData?.WEATHER_STTS?.[0];

  return {
    cd,
    lv: mapCongestLevel(row.AREA_CONGEST_LVL, cd),
    mn: toNumberOrNull(row.AREA_PPLTN_MIN),
    mx: toNumberOrNull(row.AREA_PPLTN_MAX),
    fc,
    road: mapRoadLevel(roadRaw, cd),
    temp: toNumberOrNull(weather?.TEMP),
    nres: toNumberOrNull(row.NON_RESNT_PPLTN_RATE),
    male: toNumberOrNull(row.MALE_PPLTN_RATE),
  };
}

/**
 * 단일 POI를 상류에서 가져온다. 실패(타임아웃/네트워크/INFO-000 아님)는
 * null을 반환해 호출자가 missing 처리하게 한다 — 한 곳 실패가 전체를 죽이면 안 된다.
 */
async function fetchOne(cd, env) {
  const apiKey = env.SEOUL_API_KEY;
  if (!apiKey) {
    console.log("[citydata] SEOUL_API_KEY missing");
    return null;
  }
  const upstreamUrl = `http://openapi.seoul.go.kr:8088/${apiKey}/json/citydata/1/1/${cd}/`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const resp = await fetch(upstreamUrl, { signal: controller.signal });
    if (!resp.ok) {
      console.log(`[citydata] upstream http ${resp.status} (cd=${cd})`);
      return null;
    }
    const data = await resp.json();
    const cityData = data?.CITYDATA ?? data?.SeoulRtd?.CITYDATA;
    const code = cityData?.RESULT?.["RESULT.CODE"] ?? data?.RESULT?.["RESULT.CODE"];
    // RESULT 자체가 없는 응답도 있을 수 있으니, 있을 때만 코드 검증한다.
    // (LIVE_PPLTN_STTS가 비어 있으면 normalizeUpstream에서 null로 걸러진다)
    if (code && code !== "INFO-000") {
      console.log(`[citydata] upstream result ${code} (cd=${cd})`);
      return null;
    }
    return normalizeUpstream(cd, data);
  } catch (err) {
    console.log(`[citydata] fetch failed (cd=${cd}): ${err.message || err}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 캐시에 넣고, 호출자에게도 그대로 돌려준다.
 */
async function fetchAndCache(cd, env, ctx) {
  const area = await fetchOne(cd, env);
  if (!area) return null;

  const cache = caches.default;
  const cacheKey = cacheKeyFor(cd);
  const cacheResp = new Response(JSON.stringify(area), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `max-age=${CACHE_TTL_SEC}`,
    },
  });
  // put()은 서브리퀘스트가 아니라 별도 예산이라 여기서 걱정할 게 없다.
  const putPromise = cache.put(cacheKey, cacheResp);
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(putPromise);
  } else {
    await putPromise;
  }
  return area;
}

async function readFromCache(cd) {
  const cache = caches.default;
  const hit = await cache.match(cacheKeyFor(cd));
  if (!hit) return null;
  try {
    return await hit.json();
  } catch {
    return null;
  }
}

/**
 * GET /citydata/areas
 * 120곳 전체를 캐시 우선으로 모으고, 캐시 미스는 최대 20곳만 상류에서 채운다.
 * 나머지는 missing으로 부분 응답 — 프런트는 몇 초 뒤 재호출해서 채워나간다.
 */
async function handleAreas(env, ctx, headers) {
  const allCodes = [...ALLOWED_POI_CODES];

  // 1) 캐시 조회는 서브리퀘스트로 카운트되지 않으므로 120곳 전부 먼저 확인한다.
  const cacheResults = await Promise.all(
    allCodes.map(async (cd) => ({ cd, area: await readFromCache(cd) }))
  );

  const areas = [];
  const cacheMisses = [];
  for (const { cd, area } of cacheResults) {
    if (area) {
      areas.push(area);
    } else {
      cacheMisses.push(cd);
    }
  }

  // 2) 캐시에 없던 것 중 앞에서부터 최대 MAX_UPSTREAM_PER_REQUEST개만 상류로 부른다.
  const toFetch = cacheMisses.slice(0, MAX_UPSTREAM_PER_REQUEST);
  const stillMissing = cacheMisses.slice(MAX_UPSTREAM_PER_REQUEST);

  const fetched = await Promise.all(toFetch.map((cd) => fetchAndCache(cd, env, ctx)));
  fetched.forEach((area, i) => {
    if (area) {
      areas.push(area);
    } else {
      stillMissing.push(toFetch[i]);
    }
  });

  const body = {
    fetchedAt: new Date().toISOString(),
    startHour: new Date().getUTCHours(), // KST 기준이 필요하면 프런트에서 +9 보정
    stale: false,
    areas,
    missing: stillMissing,
  };
  return new Response(JSON.stringify(body), { headers });
}

/**
 * GET /citydata/area?cd=POI068
 * 캐시 우선, 미스면 그 자리에서 상류 1건만 부른다 (서브리퀘스트 1개 소비).
 */
async function handleArea(cd, env, ctx, headers) {
  let area = await readFromCache(cd);
  let stale = false;
  if (!area) {
    area = await fetchAndCache(cd, env, ctx);
  }
  if (!area) {
    return new Response(JSON.stringify({ error: "upstream unavailable", cd }), {
      status: 502,
      headers,
    });
  }
  const body = {
    fetchedAt: new Date().toISOString(),
    startHour: new Date().getUTCHours(),
    stale,
    areas: [area],
    missing: [],
  };
  return new Response(JSON.stringify(body), { headers });
}

/**
 * index.js에서 라우팅만 하고 나머지는 여기로 위임한다.
 * headers는 index.js의 corsHeaders(origin) 결과를 그대로 받는다.
 * ctx는 fetch(request, env, ctx)의 그 ctx — cache.put()을 waitUntil로 넘겨
 * 캐시 저장 때문에 응답이 늦어지지 않게 한다. (index.js 쪽에서 ctx를 그대로 전달해야 함,
 * INTEGRATE-citydata.md의 예시 코드 참고)
 */
export async function handleCitydata(request, env, headers, ctx) {
  const url = new URL(request.url);

  if (url.pathname === "/citydata/areas") {
    return handleAreas(env, ctx, headers);
  }
  if (url.pathname === "/citydata/area") {
    const cd = url.searchParams.get("cd") || "";
    if (!ALLOWED_POI_CODES.has(cd)) {
      return new Response(JSON.stringify({ error: "unknown cd" }), { status: 400, headers });
    }
    return handleArea(cd, env, ctx, headers);
  }
  return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers });
}
