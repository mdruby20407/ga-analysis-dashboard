import fs from "node:fs/promises";

const SHEET_ID = "16zmrzjKdAc458Xso-tQHAu8qhBE6-4hs";
const GID = "346344088";
const TOTAL_NOTE = "雲端表格「客戶反饋關鍵字」有效筆數";

const alias = {
  "運動補給": ["運動補給", "補給"],
  "續航力": ["續航力", "續航"],
  "睡眠": ["睡眠"],
  "小孩": ["小孩", "孩子"],
  "攜帶方便": ["攜帶方便", "方便攜帶", "好攜帶"],
  "沒有藥感": ["沒有藥感", "藥物感", "藥感"],
  "果膠": ["果膠"],
  "葉黃素": ["葉黃素"],
  "好入口": ["好入口"],
  "接受度高": ["接受度高"],
  "不死甜": ["不死甜"],
  "獨立包裝": ["獨立包裝"],
  "好撕": ["好撕"],
  "體力": ["體力"],
  "安心": ["安心"],
  "放心": ["放心"],
  "信任": ["信任"],
  "品質": ["品質"],
  "用心": ["用心"],
  "推薦": ["推薦"],
  "能見度": ["能見度"],
  "台灣品牌": ["台灣品牌"],
  "專業": ["專業"],
  "安全": ["安全"],
  "成分": ["成分"],
  "足量": ["足量"],
  "恢復": ["恢復"],
  "提神": ["提神"],
  "精神": ["精神"],
  "眼睛": ["眼睛"],
  "乾澀": ["乾澀"],
  "飛蚊症": ["飛蚊"],
  "包裝": ["包裝"],
  "不便宜": ["不便宜"],
  "CP值": ["CP", "cp"],
  "賽事": ["賽事", "馬拉松"],
  "馬拉松": ["馬拉松"],
  "跑步": ["跑步"],
  "騎車": ["騎車", "單車"],
  "健身": ["健身"],
  "新手友善": ["新手"],
  "半馬包": ["半馬"],
  "全馬包": ["全馬"],
  "果凍": ["果凍"],
  "保健食品": ["保健食品"]
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
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); if (row.some(Boolean)) rows.push(row); }
  return rows;
}

function getTexts(rows) {
  const header = rows[0] || [];
  const feedbackIndex = header.indexOf("客戶反饋關鍵字");
  if (feedbackIndex === -1) throw new Error("找不到「客戶反饋關鍵字」欄位，請確認 Google Sheet 表頭沒有改名。");
  return rows.slice(1).map((row) => (row[feedbackIndex] || "").trim()).filter(Boolean);
}

function countLabel(texts, label) {
  const patterns = alias[label] || [label];
  const matched = texts.filter((text) => patterns.some((pattern) => text.includes(pattern)));
  return {
    count: matched.length,
    share: Number(((matched.length / texts.length) * 100).toFixed(1)),
    examples: [...new Set(matched)].slice(0, 5)
  };
}

function wordClass(count) {
  if (count >= 300) return "w1";
  if (count >= 130) return "w2";
  if (count >= 80) return "w3";
  if (count >= 30) return "w4";
  return "w5";
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function jsString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, " ");
}

function buildExamples(stats) {
  const lines = Object.entries(stats).map(([label, stat]) => {
    const examples = stat.examples.map((item) => "'" + jsString(item) + "'").join(", ");
    return "      '" + jsString(label) + "': [" + examples + "]";
  });
  return "const cloudExamples = {\n" + lines.join(",\n") + "\n    };";
}

function buildTop3(stats) {
  const top = Object.entries(stats).filter(([, stat]) => stat.count > 0).sort((a, b) => b[1].count - a[1].count).slice(0, 3);
  const copy = {
    "好吃": "直接提及最多，代表口味是保健食品能否開始、能否持續的第一門檻；常見句型包含好吃的葉黃素、好吃的果膠、方便好吃。",
    "果膠": "果膠與能量膠被大量連到運動補給、好入口、好撕與不甜不膩，顯示劑型本身就是銷售語言。",
    "方便": "方便代表不用配水、好攜帶、獨立包裝與拿了就走，對回購與日常持續很關鍵。",
    "運動補給": "運動補給反映跑者、車友與長距離族群的實際需求，銷售時要用場景與補給節奏切入。",
    "葉黃素": "葉黃素常跟小孩、眼睛、好吃與方便一起出現，代表家長在意的是願意吃與能不能持續。"
  };
  return top.map(([label, stat], index) => {
    const rank = String(index + 1).padStart(2, "0");
    const body = copy[label] || "這個詞在客戶回饋中重複出現，建議業務用實際例句切入：" + stat.examples.slice(0, 3).join("、") + "。";
    return '<article class="rank"><small>RANK ' + rank + '｜' + stat.count + ' 次｜' + stat.share + '%</small><h3>' + label + '</h3><p>' + body + '</p></article>';
  }).join("\n        ");
}

async function main() {
  const indexPath = "index.html";
  const url = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:csv&gid=" + GID;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Google Sheet 讀取失敗：" + response.status);
  const rows = parseCsv(await response.text());
  const texts = getTexts(rows);
  let html = await fs.readFile(indexPath, "utf8");
  const labels = [...html.matchAll(/<span class="word [^"]+"[^>]*>([^<]+)<\/span>/g)].map((match) => match[1].trim());
  const stats = Object.fromEntries(labels.map((label) => [label, countLabel(texts, label)]));
  html = html.replace(/<div class="top3">[\s\S]*?<\/div>\s*<\/section>/, '<div class="top3">\n        ' + buildTop3(stats) + '\n      </div>\n    </section>');
  html = html.replace(/以雲端表格「客戶反饋關鍵字」欄 \d+ 筆重算；好吃、好吃又方便、好吃的果膠都計入「好吃」。/, '以雲端表格「客戶反饋關鍵字」欄 ' + texts.length + ' 筆重算；好吃、好吃又方便、好吃的果膠都計入「好吃」。');
  html = html.replace(/<span class="word ([^"]+)" data-count="\d+"(?: data-share="[^"]+")? style="([^"]+)">([^<]+)<\/span>/g, (_, cls, style, label) => {
    const stat = stats[label.trim()] || { count: 0, share: 0 };
    return '<span class="word ' + wordClass(stat.count) + '" data-count="' + stat.count + '" data-share="' + stat.share + '" style="' + escapeAttr(style) + '">' + label + '</span>';
  });
  html = html.replace(/const cloudExamples = \{[\s\S]*?\n    \};/, buildExamples(stats));
  html = html.replace(/const cloudTotal = \d+; \/\/[^\n]*/, 'const cloudTotal = ' + texts.length + '; // ' + TOTAL_NOTE);
  await fs.writeFile(indexPath, html, "utf8");
  console.log("Updated keyword stats from " + texts.length + " feedback rows.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
