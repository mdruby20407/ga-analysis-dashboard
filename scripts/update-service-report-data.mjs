import fs from "node:fs/promises";

const SHEET_ID = "16zmrzjKdAc458Xso-tQHAu8qhBE6-4hs";
const GID = "1714313965";

const productAliases = {
  "力捷凍": ["力捷凍", "捷"], "GA GEL": ["GA GEL", "果膠"], "小金膠": ["小金膠", "金膠"],
  "小銀膠": ["小銀膠", "銀膠"], "大紅膠": ["大紅膠", "紅膠"], "葉黃素果凍": ["葉黃素果凍", "葉黃素"],
  "葉黃素飲": ["葉黃素飲", "遠見葉黃素", "遠見葉黃素飲"], "睿智膏": ["睿智膏", "睿"],
  "明日活力定": ["明日活力定", "盛", "活力定", "活力錠"], "白藜蘆醇飲": ["白藜蘆醇飲", "春", "白藜蘆醇"],
  "冰晶膠原凍": ["冰晶膠原凍", "潤", "全潤"], "心之友達": ["心之友達", "心"],
  "萃菇精": ["萃菇精", "菇精"], "維生素果凍": ["維生素果凍", "小橘凍", "B群果凍"],
  "乾杯凍": ["乾杯凍"], "W3益生菌(EOL)": ["W3益生菌", "益生菌", "W3"], "V12(EOL)": ["V12"]
};
const sourceDetailAliases = ["隱時", "美樂蒂", "蕾蕾", "dodomen"];

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = !quoted; }
    else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) { if (ch === "\r" && text[i + 1] === "\n") i += 1; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); if (row.some(Boolean)) rows.push(row); }
  return rows;
}

function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function normalizeNps(value) { return clean(value).toUpperCase().replace(/Ｖ/g, "V").replace(/Ｏ/g, "O").replace(/Ｘ/g, "X"); }
function normalHeader(value) { return clean(value).replace(/[\s\n\r/（）()]/g, "").toLowerCase(); }
function findColumn(headers, label, aliases) {
  const wanted = aliases.map(normalHeader);
  const index = headers.findIndex((header) => wanted.includes(normalHeader(header)));
  if (index === -1) throw new Error("找不到必要欄位：" + label);
  return index;
}
function cleanMonth(value) { const match = clean(value).match(/(20\d{2})\D+(\d{1,2})/); return match ? `${match[1]}/${String(Number(match[2])).padStart(2, "0")}` : ""; }
function cleanDate(value) {
  const match = clean(value).match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
  return match ? `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}` : "";
}
function detectProducts(text) {
  const haystack = clean(text).toLowerCase();
  return Object.entries(productAliases).filter(([, aliases]) => aliases.some((alias) => haystack.includes(alias.toLowerCase()))).map(([name]) => name);
}
function hasAny(text, pattern) { return pattern.test(text); }
function sceneSignals(text) {
  const rules = {
    time: ["早上", "上午", "中午", "下午", "晚上", "睡前", "飯前", "飯後", "運動前", "運動後", "上班", "賽前"],
    place: ["辦公室", "公司", "家裡", "家中", "跑步", "健身房", "比賽", "戶外", "車上", "學校"],
    occasion: ["上班", "運動", "跑步", "健身", "比賽", "出差", "旅行", "熬夜", "用眼", "親子"],
    user: ["自己", "家人", "小孩", "兒童", "長輩", "先生", "太太", "爸媽"],
    method: ["直接吃", "搭配", "飯後", "睡前", "運動前", "運動後", "攜帶", "冷藏"]
  };
  const result = {};
  for (const [key, words] of Object.entries(rules)) result[key] = words.filter((word) => text.includes(word));
  return result;
}
const TOPIC_LIBRARY = {
  q1: [["好吃與好入口", /好吃|不甜|好入口|口味|果凍|吞/], ["體感與恢復", /有感|不累|恢復|體力|睡眠|精神|眼睛/], ["方便攜帶", /方便|攜帶|好撕/], ["包裝與設計", /包裝|設計|帥|好看|面子/], ["安心與信任", /安心|信任|推薦|品牌|用心/]],
  q2: [["價格與方案", /貴|價格|優惠|折扣|方案|預算|CP/], ["甜度與口味", /太甜|甜|口味|味道|難吃|苦/], ["體感不明顯", /無感|沒感覺|沒效|效果/], ["攜帶或使用不便", /不方便|攜帶|包裝|不好撕|尺寸/], ["未提出明顯不滿", /沒有|無|都不錯|無法問到/]],
  q3: [["新品與產品線", /新品|產品|開發|推出|益生菌|腸胃|女性|骨骼/], ["兒童與家庭市場", /小孩|兒童|家人|鈣片|果凍/], ["口味與甜度", /甜|口味|不甜/], ["包裝與攜帶", /包裝|尺寸|攜帶|方便/], ["價格與購買方案", /價格|付款|方案|折扣|優惠/]],
  q4: [["安心可信任", /安心|信任|推薦|用心|品牌/], ["好吃好入口", /好吃|不甜|果凍|好入口/], ["方便攜帶", /方便|攜帶/], ["專業與運動感", /專業|賽事|運動|KOL|教練/], ["設計有質感", /設計|帥|好看|面子|包裝/]],
  q5: [["運動恢復與續航", /不累|恢復|續航|體力|跑步|運動/], ["睡眠與精神", /睡眠|睡|精神|入睡/], ["眼睛與用眼", /眼睛|乾澀|葉黃素|用眼/], ["補充更方便", /方便|攜帶|果凍|好入口|吞/], ["安心降低選擇焦慮", /安心|信任|推薦|品牌/]],
  future: [["腸胃與益生菌", /腸胃|排便|益生菌/], ["兒童與家庭", /小孩|兒童|家人|鈣/], ["運動與恢復", /運動|跑步|恢復|體力/], ["睡眠與放鬆", /睡眠|GABA|放鬆/], ["眼睛與用眼", /眼睛|葉黃素|乾澀/], ["其他新品期待", /產品|新品|開發/]]
};
function topicLabels(text, group) { return (TOPIC_LIBRARY[group] || []).filter(([, pattern]) => pattern.test(text)).map(([label]) => label); }
function phsLabels(text) {
  return {
    person: [["自己使用", /自己/], ["家人共享", /家人|先生|太太|爸媽/], ["親子族群", /小孩|兒童/], ["長輩族群", /長輩/]].filter(([, p]) => p.test(text)).map(([x]) => x),
    product: [["口味與好入口", /好吃|不甜|好入口|口味|果凍/], ["體感與續航", /有感|不累|恢復|體力|精神|睡眠/], ["方便與包裝", /方便|攜帶|包裝|設計|好撕/], ["安心與信任", /安心|信任|推薦|品牌/], ["價格與方案", /價格|貴|優惠|方案/]].filter(([, p]) => p.test(text)).map(([x]) => x),
    place: [["運動場景", /運動|跑步|健身|賽事|比賽/], ["工作與用眼", /上班|公司|辦公室|用眼/], ["居家生活", /家裡|家中/], ["外出與旅行", /外出|旅行|出差|車上/], ["親子日常", /小孩|兒童|親子/]].filter(([, p]) => p.test(text)).map(([x]) => x)
  };
}
function statusGroup(status) {
  if (/簡短回應\s*[（(]\s*有效\s*[）)]/.test(status)) return "brief";
  if (/(願意訪談|樂意分享)\s*[（(]\s*有效\s*[）)]/.test(status)) return "complete";
  if (/無效電話\s*[（(]\s*沒空\s*[）)]/.test(status)) return "answeredNoInterview";
  if (/無效電話\s*[（(]\s*無接聽\s*[）)]/.test(status)) return "missed";
  return "unknown";
}
function questionFlags(contact, like, dislike, keywords) {
  return {
    q1: Boolean(like), q2: Boolean(dislike), q4: Boolean(keywords),
    q3: hasAny(contact, /創辦人|改變|建議|改善|新增|增加|推出|開發|希望(?:能|有|做|出|增加|推出|改善)|可以(?:增加|推出|開發|改善)/),
    q5: hasAny(contact, /解決|痛點|改善|幫助|有感|不累|恢復|體力|睡眠|精神|眼睛|吃得下|吞|排便|腸胃/)
  };
}
function originalPhrases(value) {
  return clean(value).split(/[\n、，,；;／/]+/).map(clean).filter((item) => item.length >= 2 && item.length <= 80);
}
async function loadGlobalKeywordTop() {
  const indexHtml = await fs.readFile("index.html", "utf8");
  const top = [...indexHtml.matchAll(/<article class="rank"><small>RANK \d+｜(\d+) 次｜([\d.]+)%<\/small><h3>([^<]+)<\/h3>/g)]
    .slice(0, 3)
    .map((match) => ({ keyword: clean(match[3]), count: Number(match[1]), share: Number(match[2]) }));
  const total = Number((indexHtml.match(/const cloudTotal = (\d+)/) || [])[1] || 0);
  if (top.length !== 3 || !total) throw new Error("無法讀取已發布的關鍵字分析統計");
  return { total, top };
}

async function buildData() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Sheet 讀取失敗：${response.status}`);
  const rows = parseCsv(await response.text());
  const headers = rows[0] || [];
  const columns = {
    month: findColumn(headers, "年/月", ["年/月"]), date: findColumn(headers, "撥打日期", ["撥打日期"]),
    status: findColumn(headers, "狀態", ["狀態"]), phone: findColumn(headers, "電話號碼", ["電話號碼 (會員號)", "電話號碼"]),
    gender: findColumn(headers, "性別", ["性別"]), newOld: findColumn(headers, "新舊客", ["新舊客"]),
    vip: findColumn(headers, "是否 VIP", ["是否 VIP", "是否VIP"]), source: findColumn(headers, "如何得知GA", ["如何得知GA (來源）", "如何得知GA (來源)"]),
    nps: findColumn(headers, "是否願意推薦", ["是否 願意推薦", "是否願意推薦"]), contact: findColumn(headers, "聯繫狀況", ["聯繫狀況（內容）", "聯繫狀況(內容)"]),
    usage: findColumn(headers, "使用體感", ["使用體感"]), keywords: findColumn(headers, "其他建議／關鍵字", ["其他建議/關鍵字", "其他建議／關鍵字"]),
    like: findColumn(headers, "最喜歡", ["最喜歡"]), dislike: findColumn(headers, "最討厭／改變", ["最討厭/改變", "最討厭／改變"]),
    expected: findColumn(headers, "期待方向", ["期待方向"]), future: findColumn(headers, "期待未來開發的產品", ["期待未來開發的產品"]), event: findColumn(headers, "期望舉辦的活動", ["期望舉辦的活動"])
  };
  const customerKeys = new Map(); let nextCustomerKey = 1; let currentMonth = ""; const records = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]; const explicitMonth = cleanMonth(row[columns.month]); if (explicitMonth) currentMonth = explicitMonth;
    const date = cleanDate(row[columns.date]); const month = explicitMonth || currentMonth;
    if (!date || !month) continue;
    const phone = clean(row[columns.phone]).replace(/\D/g, "");
    const customerKey = phone ? (customerKeys.get(phone) || (customerKeys.set(phone, nextCustomerKey), nextCustomerKey++)) : null;
    const status = clean(row[columns.status]); const contact = clean(row[columns.contact]);
    const like = clean(row[columns.like]); const dislike = clean(row[columns.dislike]); const keywords = clean(row[columns.keywords]);
    const usage = clean(row[columns.usage]); const expected = clean(row[columns.expected]); const future = clean(row[columns.future]); const event = clean(row[columns.event]);
    const combined = [contact, usage, keywords, like, dislike, expected, future, event].join(" ");
    const nps = normalizeNps(row[columns.nps]);
    const answerThemes = { q1: topicLabels(like, "q1"), q2: topicLabels(dislike, "q2"), q3: topicLabels(contact, "q3"), q4: topicLabels(keywords, "q4"), q5: topicLabels(contact, "q5") };
    const phs = phsLabels(combined);
    records.push({
      id: i, customerKey, date, month, status: status || "未填", statusGroup: statusGroup(status),
      newOld: clean(row[columns.newOld]) || "未填", gender: clean(row[columns.gender]) || "未填", vip: clean(row[columns.vip]) || "未填", source: clean(row[columns.source]) || "未填",
      nps: ["V", "O", "X"].includes(nps) ? nps : "", products: detectProducts(combined),
      sourceDetails: sourceDetailAliases.filter((name) => [clean(row[columns.source]), combined].some((text) => text.toLowerCase().includes(name.toLowerCase()))),
      keywordRaw: originalPhrases(keywords),
      activityPhrases: originalPhrases(event).filter((item) => /跑|騎|登山|露營|親子|講座|運動|聚|活動|賽|瑜伽|健身|旅遊|戶外/.test(item)),
      questions: questionFlags(contact, like, dislike, keywords),
      answerThemes,
      phs,
      detractorReasons: topicLabels([dislike, contact].join(" "), "q2"),
      futureThemes: topicLabels([expected, future].join(" "), "future"),
      themes: { taste: hasAny(combined, /好吃|不甜|好入口|甜度|口味/), convenience: hasAny(combined, /方便|攜帶|好撕|包裝|設計|帥|好看/), effect: hasAny(combined, /有感|不累|恢復|體力|睡眠|精神|眼睛/), trust: hasAny(combined, /安心|信任|推薦|品牌|用心/) },
      scene: sceneSignals(combined), expected: Boolean(expected || future), event: Boolean(event)
    });
  }
  const globalKeywords = await loadGlobalKeywordTop();
  return { updatedAt: new Date().toISOString(), sourceRows: rows.length - 1, dateRange: { min: records[0]?.date || "", max: records.at(-1)?.date || "" }, globalKeywords, records, products: Object.keys(productAliases) };
}

const outputPath = process.argv[2] || "data/service-report-data.json";
const data = await buildData();
if (data.sourceRows < 20000 || data.records.length < 20000) throw new Error(`客服資料量異常，停止覆蓋正式資料：${JSON.stringify({ sourceRows: data.sourceRows, records: data.records.length })}`);
await fs.mkdir(outputPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(data), "utf8");
console.log("Updated service report data:", data.records.length, "records");

