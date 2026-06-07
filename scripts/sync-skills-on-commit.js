#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = process.cwd();
const docDir = path.join(rootDir, "docs/skills");
const designSkill = path.join(docDir, "design-system-style.md");
const flowSkill = path.join(docDir, "task-state-flow.md");

const SKIP_PATHS = [
  "docs/skills/",
  "docs/labelhub-plan/",
  "node_modules/",
  "dist/",
  "build/",
];

const DESIGN_PATHS = [
  /^apps\/web\/src\//,
];

const FLOW_PATHS = [
  /^apps\/api\/src\//,
  /^apps\/worker\/src\//,
  /^packages\//,
  /^apps\/web\/src\/pages\/(owner|reviewer|agent|labeler)\//,
  /^apps\/web\/src\/features\/review\//,
  /^apps\/web\/src\/features\/schema-renderer\//,
];

const DESIGN_KEYWORDS = [
  /\bclassName\b/,
  /\bclass\b\s*=/,
  /\bstyle\b\s*=/,
  /\bcss\b\b/,
  /background|bg-|text-|border|rounded|padding|margin|gap|space-|shadow|palette|theme|badge|chip|pill|卡片|按钮|按钮组|时间线|timeline/i,
];

const FLOW_KEYWORDS = [
  /\bstatus\b/i,
  /\bstate\b/i,
  /\bworkflow\b/i,
  /\btransition\b/i,
  /\baudit\b/i,
  /\breview\b/i,
  /\b提交\s*状态\b/i,
  /\bAI[_\s]*预审\b/i,
  /\b终审\b/i,
  /\b任务状态\b/i,
  /\b状态机\b/i,
  /\bRETRY|FAILED|QUEUED|SUCCEEDED|RUNNING\b/,
];

function run(cmd) {
  return execSync(cmd, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    cwd: rootDir,
  }).trim();
}

function getStagedFiles() {
  const raw = run("git diff --cached --name-only --diff-filter=ACMRTUXB");
  if (!raw) {
    return [];
  }
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => SKIP_PATHS.every((prefix) => !file.startsWith(prefix)));
}

function hasMatch(lines, regexList) {
  return lines.filter((line) =>
    regexList.some((reg) => reg.test(line))
  );
}

function getStagedDiff(file) {
  const diff = run(`git diff --cached --unified=0 -- ${JSON.stringify(file)}`);
  return diff
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1).trim())
    .filter(Boolean);
}

function pickSignals(file, lines) {
  return {
    design: hasMatch(lines, DESIGN_KEYWORDS),
    flow: hasMatch(lines, FLOW_KEYWORDS),
  };
}

function scope(file) {
  const isDesign = DESIGN_PATHS.some((reg) => reg.test(file));
  const isFlow = FLOW_PATHS.some((reg) => reg.test(file));
  return { isDesign, isFlow };
}

function appendSection(filePath, items) {
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const marker = "## 自动沉淀草案（commit hook）";

  const unique = Array.from(
    new Map(
      items.map((line) => [line, line])
    ).values()
  );

  const block = [
    "",
    `### ${now}`,
    ...unique.map((line) => `- ${line}`),
    "",
  ].join("\n");

  let nextContent;
  if (existing.includes(marker)) {
    const idx = existing.indexOf(marker) + marker.length;
    nextContent =
      existing.slice(0, idx) +
      "\n" +
      block +
      existing.slice(idx).trimEnd() +
      "\n";
  } else {
    nextContent = `${existing.trimEnd()}\n\n${marker}\n${block}`;
  }

  if (nextContent === existing) {
    return false;
  }
  fs.writeFileSync(filePath, `${nextContent}\n`, "utf8");
  return true;
}

function main() {
  const skip = process.env.SKILL_SYNC_DISABLED === "1";
  if (skip) {
    return 0;
  }

  const stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    return 0;
  }

  const designEntries = [];
  const flowEntries = [];

  for (const file of stagedFiles) {
    const s = scope(file);
    const lines = getStagedDiff(file);
    const signals = pickSignals(file, lines);

    if ((s.isDesign || signals.design.length > 0) && signals.design.length > 0) {
      designEntries.push(
        `${file}: ${signals.design.slice(0, 4).join("；")}`
      );
    }

    if ((s.isFlow || signals.flow.length > 0) && signals.flow.length > 0) {
      flowEntries.push(
        `${file}: ${signals.flow.slice(0, 4).join("；")}`
      );
    }
  }

  if (designEntries.length === 0 && flowEntries.length === 0) {
    return 0;
  }

  const changed = [];
  if (designEntries.length > 0) {
    const changedDesign = appendSection(designSkill, [
      "检测到本次提交中新增了可复用样式/组件相关改动，请确认是否形成新的页面设计/组件沉淀标准。",
      "建议新增标准来源于本次 diff：",
      ...designEntries,
    ]);
    if (changedDesign) {
      changed.push(designSkill);
    }
  }

  if (flowEntries.length > 0) {
    const changedFlow = appendSection(flowSkill, [
      "检测到本次提交中新增了状态流转/审核流程相关改动，请确认是否形成新的任务状态标准。",
      "建议新增标准来源于本次 diff：",
      ...flowEntries,
    ]);
    if (changedFlow) {
      changed.push(flowSkill);
    }
  }

  if (changed.length > 0) {
    run(`git add ${changed.map((file) => JSON.stringify(path.relative(rootDir, file))).join(" ")}`);
    console.log(
      "[skill-sync] 已为本次提交生成自动沉淀草案：",
      changed.map((file) => path.relative(rootDir, file)).join(", ")
    );
  }
}

main();
