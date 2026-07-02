import fs from "node:fs/promises";

const SHEET_ID = "16zmrzjKdAc458Xso-tQHAu8qhBE6-4hs";
const GID = "1714313965";

const productAliases = {
  "力捷凍": ["力捷凍", "捷"],
  "GA GEL": ["GA GEL", "果膠"],
  "小金膠": ["小金膠", "金膠"],
  "小銀膠": ["小銀膠", "銀膠"],
  "大紅膠": ["大紅膠", "紅膠"],
  "葉黃素果凍": ["葉黃素果凍", "葉黃素"],
  "葉黃素飲": ["葉黃素飲", "遠見葉黃素", "遠見葉黃素飲"],
  "睿智膏": ["睿智膏", "睿"],
  "明日活力定": ["明日活力定", "盛", "活力定", "活力錠"],
  "白藜蘆醇飲": ["白藜蘆醇飲", "春", "白藜蘆醇"],
  "冰晶膠原凍": ["冰晶膠原凍", "潤", "全潤"],
  "心之友達": ["心之友達", "心"],
  "萃菇精": ["萃菇精", "菇精"],
  "維生素果凍": ["維生素果凍", "小橘凍", "B群果凍"],
  "W3益生菌(EOL)": ["W3益生菌", "益生菌", "W3"],
  "V12(EOL)": ["V12"]
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((item) => item !== "")) rows.push(row);
      row = []; cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((item) => item !== "")) rows.push(row);
  }
  return rows;
}

function cleanMonth(value) {
  const match = String(value || "").match(/(20\d{2})\D+(\d{1,2})/);
  return match ? match[1] + "/" + String(Number(match[2])).padStart(2, "0") : "";
}

function sanitize(value) {
  return String(value || "")
    .replace(/09\d{2}[-\s]?\d{3}[-\s]?\d{3}/g, "09xx-xxx-xxx")
    .replace(/0\d{1,2}[-\s]?\d{6,8}/g, "電話已遮蔽")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, "***@***")
    .replace(/[A-Z][12]\d{8}/ig, "身分資訊已遮蔽")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value, max = 88) {
  const text = summarize(value);
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function summarize(value) {
  let text = sanitize(value);
  text = text.replace(/^(客人|客戶|表示|提到|說|覺得|認為)[:：\s]*/g, "");
  if (!text) return "";
  if (/速度.*沒有.*變快|沒有.*變快.*不累/.test(text)) return "客戶提到速度未必明顯變快，但運動後疲勞感降低。";
  if (/比較不甜|不甜/.test(text) && /金膠|果膠/.test(text)) return "客戶偏好較不甜的果膠口味，尤其對金膠接受度較高。";
  if (/包裝|設計|面子|好看|帥/.test(text)) return "客戶肯定包裝與設計感，認為拿出去有形象與分享價值。";
  if (/小孩|兒童|鈣片|吞/.test(text)) return "客戶提到兒童或不擅吞錠族群，適合用果凍化、好入口產品切入。";
  if (/安心|信任|MJ|推薦/.test(text)) return "客戶把品牌與安心、信任、推薦意願連在一起。";
  return text;
}

function invalidStatus(value) {
  return /無效|無接|未接|空號|停話|拒接|忙線|沒接|電話中|關機|語音|暫停使用/.test(value || "");
}

function noticeOnly(contact, insightText) {
  const isNotice = /通知|告知|提醒|活動|邀約|簡訊|訊息|LINE|line|mail|email|寄送|名單|問卷|確認資料|提醒回覆/.test(contact || "");
  const hasInsight = /喜歡|討厭|建議|改變|期待|關鍵字|有感|體感|不累|恢復|好吃|不甜|推薦|安心|痛點|問題|希望|開發|回購|停止購買/.test(insightText || "");
  return isNotice && !hasInsight;
}

function detectProducts(text) {
  const found = [];
  const haystack = String(text || "").toLowerCase();
  for (const [name, aliases] of Object.entries(productAliases)) {
    if (aliases.some((alias) => haystack.includes(alias.toLowerCase()))) found.push(name);
  }
  return [...new Set(found)];
}

function pick(text, words) {
  const parts = String(text || "").split(/[。！？!?；;\n]/).map((item) => item.trim()).filter(Boolean);
  const found = parts.find((part) => words.some((word) => part.includes(word)));
  return compact(found || "");
}

function tags(text) {
  const result = [];
  if (/好吃|好入口|不甜|適口|藥感|難吃|苦/.test(text)) result.push("口味接受度");
  if (/方便|攜帶|好撕|包裝|設計|面子|好看|帥/.test(text)) result.push("便利與設計");
  if (/有感|有效|體感|不累|恢復|續航|體力|睡眠|精神/.test(text)) result.push("體感效果");
  if (/安心|信任|MJ|推薦|品牌/.test(text)) result.push("品牌信任");
  if (/價格|優惠|太貴|不便宜/.test(text)) result.push("價格方案");
  if (/小孩|兒童|長輩|吞|鈣片/.test(text)) result.push("新市場機會");
  return [...new Set(result)];
}

function findQuestionAnswers(row, combined) {
  const q1 = compact(row[23] || pick(combined, ["喜歡", "最喜歡", "安心", "信任", "好吃", "不甜", "方便", "有感", "願意推薦", "設計", "包裝", "面子", "恢復", "不累", "好入口", "有效", "體感"]));
  const q2 = compact(row[24] || row[26] || pick(combined, ["討厭", "不喜歡", "太甜", "太貴", "不便宜", "苦", "難吃", "沒效", "無感", "麻煩", "不好撕", "膩", "不方便", "停止購買"]));
  const q3 = compact(row[25] || row[28] || row[29] || row[32] || row[33] || pick(combined, ["改變", "建議", "希望", "期待", "開發", "如果", "創辦人", "兒童", "市場", "活動", "優惠", "服務", "產品"]));
  const q4 = compact(row[22] || pick(combined, ["關鍵字", "形容", "安心", "信任", "品牌", "推薦"]));
  const q5 = compact(row[21] || pick(combined, ["解決", "痛點", "有感", "不累", "恢復", "睡眠", "體力", "眼睛", "方便"]));
  return { q1, q2, q3, q4, q5 };
}

async function buildQuestionsData() {
  const url = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:csv&gid=" + GID;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Google Sheet 讀取失敗：" + response.status);
  const rows = parseCsv(await response.text());
  const records = [];
  const skipped = { invalid: 0, notice: 0, noMonth: 0, noInsight: 0 };
  let currentMonth = "";

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const explicitMonth = cleanMonth(row[1]);
    if (explicitMonth) currentMonth = explicitMonth;
    const month = explicitMonth || currentMonth;
    if (!month) { skipped.noMonth += 1; continue; }

    const status = sanitize(row[5]);
    if (invalidStatus(status)) { skipped.invalid += 1; continue; }

    const contact = sanitize(row[16]);
    const insightText = [row[21], row[22], row[23], row[24], row[25], row[26], row[27], row[28], row[29], row[30], row[31], row[32], row[33]].map(sanitize).join(" ");
    if (noticeOnly(contact, insightText)) { skipped.notice += 1; continue; }

    const combined = [contact, insightText].join(" ");
    const answers = findQuestionAnswers(row, combined);
    if (!Object.values(answers).some(Boolean)) { skipped.noInsight += 1; continue; }

    const products = detectProducts(combined);
    records.push({
      id: i,
      month,
      status: status || "未填",
      gender: sanitize(row[6]) || "未填",
      vip: sanitize(row[18]) || "未填",
      products: products.length ? products : ["未標記產品"],
      tags: tags(combined),
      ...answers
    });
  }

  const pii = { phone: 0, email: 0, id: 0 };
  for (const record of records) {
    const text = JSON.stringify(record);
    if (/09\d{2}[-\s]?\d{3}[-\s]?\d{3}|0\d{1,2}[-\s]?\d{6,8}/.test(text)) pii.phone += 1;
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) pii.email += 1;
    if (/[A-Z][12]\d{8}/i.test(text)) pii.id += 1;
  }
  if (pii.phone || pii.email || pii.id) throw new Error("去識別化檢查未通過：" + JSON.stringify(pii));

  return {
    updatedAt: new Date().toISOString(),
    sourceRows: rows.length - 1,
    skipped,
    records,
    months: [...new Set(records.map((record) => record.month))].sort(),
    products: Object.keys(productAliases),
    statuses: [...new Set(records.map((record) => record.status))].sort().slice(0, 40),
    vips: [...new Set(records.map((record) => record.vip))].sort()
  };
}

const outputPath = process.argv[2] || "data/questions-data.json";
const data = await buildQuestionsData();
await fs.mkdir(outputPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(data), "utf8");
console.log("Updated questions data:", data.records.length, "records");
