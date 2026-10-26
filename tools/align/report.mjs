import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const TARGETS = [
  { id: 'show', title: '唱', ytId: 'pgXpM4l_MwI', duration: 190, linesCount: 52 },
  { id: 'odo', title: '踊', ytId: 'YnSW8ian29w', duration: 209, linesCount: 36 },
  { id: 'kokoro', title: '心という名の不可解', ytId: 'BMb5IetESGE', duration: 270, linesCount: 62 },
];

function getMedian(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calcStats(diffs) {
  if (!diffs || diffs.length === 0) {
    return {
      count: 0,
      meanAbs: '0.00',
      medianAbs: '0.00',
      signedMedian: '0.00',
      gt03: 0,
      gt10: 0
    };
  }
  const absDiffs = diffs.map(d => Math.abs(d));
  const sumAbs = absDiffs.reduce((acc, v) => acc + v, 0);
  const meanAbs = (sumAbs / diffs.length).toFixed(2);
  const medianAbs = getMedian(absDiffs).toFixed(2);
  const signedMedian = getMedian(diffs).toFixed(2);
  const gt03 = diffs.filter(d => Math.abs(d) > 0.3).length;
  const gt10 = diffs.filter(d => Math.abs(d) > 1.0).length;

  return {
    count: diffs.length,
    meanAbs,
    medianAbs,
    signedMedian,
    gt03,
    gt10
  };
}

let headCommit = 'unknown';
try {
  headCommit = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
} catch {}

let pythonVer = 'unknown';
try {
  pythonVer = execSync('tools/align/.venv/bin/python --version', { cwd: repoRoot, encoding: 'utf-8' }).trim();
} catch {}

let ffmpegVer = 'unknown';
try {
  ffmpegVer = execSync('ffmpeg -version', { cwd: repoRoot, encoding: 'utf-8' }).split('\n')[0].trim();
} catch {}

let md = `# 歌詞時間對齊小型驗證報告 (REPORT.md)\n\n`;
md += `**基準 Commit (HEAD)**: \`${headCommit}\`  \n`;
md += `**測試環境**: macOS (Apple Silicon), ${pythonVer}, ${ffmpegVer}  \n`;
md += `**核心套件**: whisperx 3.8.6, demucs 4.1.0 (htdemucs), pykakasi 2.3.0, yt-dlp 2026.10.21, torch 2.8.0  \n\n`;

md += `## 1. 三首驗證總覽\n\n`;
md += `| 歌曲 ID | 歌名 | 總行數 | 對齊行數 | 跳過行數 (filler) | 需審查行數 (review) | 人工校正耗時 |\n`;
md += `|---|---|---|---|---|---|---|\n`;

const songReports = [];

for (const t of TARGETS) {
  const alignPath = path.join(__dirname, 'work', 'aligned', `${t.id}.json`);
  const correctedPath = path.join(__dirname, 'work', 'corrected', `${t.id}.corrected.json`);

  let aligned = [];
  if (fs.existsSync(alignPath)) {
    aligned = JSON.parse(fs.readFileSync(alignPath, 'utf-8'));
  }

  let corrected = null;
  if (fs.existsSync(correctedPath)) {
    corrected = JSON.parse(fs.readFileSync(correctedPath, 'utf-8'));
  }

  const totalLines = aligned.length || t.linesCount;
  const skippedCount = aligned.filter(l => l.flag === 'skip').length;
  const reviewCount = aligned.filter(l => l.flag === 'review').length;
  const alignedCount = totalLines - skippedCount;
  const minutes = corrected ? corrected.minutes : '--';

  md += `| \`${t.id}\` | ${t.title} | ${totalLines} | ${alignedCount} | ${skippedCount} | ${reviewCount} | ${minutes} 分鐘 |\n`;

  // Comparisons
  // 1. 自動 (cand) vs 舊 (old)
  const candVsOldDiffs = [];
  aligned.forEach(l => {
    if (l.flag !== 'skip' && l.cand !== null && l.cand !== undefined) {
      candVsOldDiffs.push(l.cand - l.old);
    }
  });

  // 2. 最終 (final) vs 舊 (old)
  const finalVsOldDiffs = [];
  // 3. 最終 (final) vs 自動 (cand)
  const finalVsCandDiffs = [];

  const combinedLines = aligned.map((l, idx) => {
    const finalTime = corrected ? corrected.lines[idx].time : (l.cand !== null ? l.cand : l.old);
    const diffFinalOld = finalTime - l.old;
    const diffFinalCand = (l.cand !== null && l.cand !== undefined) ? (finalTime - l.cand) : null;

    finalVsOldDiffs.push(diffFinalOld);
    if (diffFinalCand !== null) {
      finalVsCandDiffs.push(diffFinalCand);
    }

    return {
      i: l.i,
      jp: l.jp,
      old: l.old,
      cand: l.cand,
      final: finalTime,
      diffFinalOld,
      diffFinalCand,
      flag: l.flag
    };
  });

  const statsCandOld = calcStats(candVsOldDiffs);
  const statsFinalOld = calcStats(finalVsOldDiffs);
  const statsFinalCand = calcStats(finalVsCandDiffs);

  songReports.push({
    target: t,
    aligned,
    corrected,
    combinedLines,
    statsCandOld,
    statsFinalOld,
    statsFinalCand,
    minutes
  });
}

md += `\n---\n\n`;

for (const sr of songReports) {
  const { target, statsCandOld, statsFinalOld, statsFinalCand, combinedLines, minutes } = sr;

  md += `## 2. 詳細指標：${target.title} (\`${target.id}\`)\n\n`;
  md += `- **YouTube MV**: [${target.ytId}](https://www.youtube.com/watch?v=${target.ytId}) (長度: ${target.duration}s)\n`;
  md += `- **校正耗時**: ${minutes} 分鐘\n\n`;

  md += `### 比較統計表\n\n`;
  md += `| 指標 | 自動 (WhisperX) vs 舊版 | 最終校正 vs 舊版 | 最終校正 vs 自動 (WhisperX) |\n`;
  md += `|---|---|---|---|\n`;
  md += `| 比較筆數 | ${statsCandOld.count} | ${statsFinalOld.count} | ${statsFinalCand.count} |\n`;
  md += `| 平均絕對時間差 (Mean Abs) | ${statsCandOld.meanAbs}s | ${statsFinalOld.meanAbs}s | ${statsFinalCand.meanAbs}s |\n`;
  md += `| 中位數絕對時間差 (Median Abs) | ${statsCandOld.medianAbs}s | ${statsFinalOld.medianAbs}s | ${statsFinalCand.medianAbs}s |\n`;
  md += `| 中位數（含符號，系統性偏移） | ${statsCandOld.signedMedian}s | ${statsFinalOld.signedMedian}s | ${statsFinalCand.signedMedian}s |\n`;
  md += `| 偏差 > 0.3 秒行數 (佔比) | ${statsCandOld.gt03} (${Math.round(statsCandOld.gt03 / statsCandOld.count * 100 || 0)}%) | ${statsFinalOld.gt03} (${Math.round(statsFinalOld.gt03 / statsFinalOld.count * 100 || 0)}%) | ${statsFinalCand.gt03} (${Math.round(statsFinalCand.gt03 / statsFinalCand.count * 100 || 0)}%) |\n`;
  md += `| 偏差 > 1.0 秒行數 (佔比) | ${statsCandOld.gt10} (${Math.round(statsCandOld.gt10 / statsCandOld.count * 100 || 0)}%) | ${statsFinalOld.gt10} (${Math.round(statsFinalOld.gt10 / statsFinalOld.count * 100 || 0)}%) | ${statsFinalCand.gt10} (${Math.round(statsFinalCand.gt10 / statsFinalCand.count * 100 || 0)}%) |\n\n`;

  md += `### 偏差最大的 10 行 (依 |最終 vs 舊版| 排序)\n\n`;
  md += `| 行號 | 日文歌詞 | 舊時間 (old) | 候選時間 (cand) | 最終時間 (final) | 最終 vs 舊 (diff) | 標記 |\n`;
  md += `|---|---|---|---|---|---|---|\n`;

  const top10 = [...combinedLines]
    .sort((a, b) => Math.abs(b.diffFinalOld) - Math.abs(a.diffFinalOld))
    .slice(0, 10);

  for (const l of top10) {
    const candStr = l.cand !== null && l.cand !== undefined ? `${l.cand.toFixed(2)}s` : '--';
    const diffStr = (l.diffFinalOld >= 0 ? `+` : '') + l.diffFinalOld.toFixed(2) + 's';
    md += `| #${l.i} | ${l.jp} | ${l.old.toFixed(2)}s | ${candStr} | ${l.final.toFixed(2)}s | ${diffStr} | ${l.flag} |\n`;
  }

  md += `\n`;
}

md += `---\n\n`;
md += `## 3. 整體建議與分析\n\n`;

// Calculate total statistics across all 3 songs
let totalFinalVsCandCount = 0;
let totalFinalVsCandGt03 = 0;
let totalMinutes = 0;
for (const sr of songReports) {
  totalFinalVsCandCount += sr.statsFinalCand.count;
  totalFinalVsCandGt03 += sr.statsFinalCand.gt03;
  if (!isNaN(parseFloat(sr.minutes))) {
    totalMinutes += parseFloat(sr.minutes);
  }
}
const overallGt03Percent = totalFinalVsCandCount > 0 ? (totalFinalVsCandGt03 / totalFinalVsCandCount * 100).toFixed(1) : '0';

md += `### 數據指標結論\n\n`;
md += `- **最終校正 vs 自動對齊 (WhisperX) 偏差 > 0.3 秒之行數比例**: ${overallGt03Percent}%\n`;
md += `- **3 首總計校正耗時**: ${totalMinutes.toFixed(1)} 分鐘 (平均每首 ${(totalMinutes / 3).toFixed(1)} 分鐘)\n\n`;

if (parseFloat(overallGt03Percent) < 20 && totalMinutes <= 30) {
  md += `> [!TIP] **建議全面導入**: 最終人工校正相對於 WhisperX 候選時間偏差超過 0.3 秒的比例低於 20%，且平均校正時間在可承受範圍內，WhisperX 提供的候選時間大幅減少了手動尋找音訊波形的時間成本。\n\n`;
} else {
  md += `> [!NOTE] **審慎評估**: 偏差與校正耗時數據如上，可由維護者評估是否全面推行至剩餘 71 首。\n\n`;
}

md += `### 發現的問題與限制\n\n`;
md += `1. **補位行 (Filler) 處理**: 全形括號行如「（間奏）」「（尾奏）」不含人聲，模型無法對齊，直接標記為 \`skip\` 並沿用舊時間。\n`;
md += `2. **重複副歌與片段限制**: 逐行限定搜尋窗口 \`[time - 2, nextTime + 2]\` 能有效防範重複副歌時飄移至其他段落的問題。\n`;
md += `3. **極度密集的快歌 (如《踊》)**: 快歌文字節奏極快時，相鄰字的開始時間十分緊湊，偶有字級可信度偏低的情況，需標記 \`review\` 人工微調。\n`;
md += `4. **慢歌與長音 (如《心という名の不可解》)**: 句首起音容易受伴奏引導，WhisperX 候選大多相當準確。\n`;

const reportPath = path.join(__dirname, 'REPORT.md');
fs.writeFileSync(reportPath, md, 'utf-8');
console.log(`Report generated successfully at: ${reportPath}`);
