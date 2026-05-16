import type { VercelRequest, VercelResponse } from "@vercel/node";

type PeriodType = "month" | "year";
type ScopeType = "personal" | "family";
type FlowType = "income" | "expense";

type Category = {
  id: string;
  name: string;
  flow_type: FlowType;
  sort_order: number;
};

type Entry = {
  id: string;
  category_id: string;
  scope: ScopeType;
  period_type: PeriodType;
  period_start: string;
  item_name: string;
  amount: number;
  note: string;
};

type FamilySaving = {
  id: string;
  period_type: PeriodType;
  period_start: string;
  person: "yangbao" | "yubao";
  source_name: string;
  amount: number;
  note: string;
};

type AnalysisInput = {
  question: string;
  periodType: PeriodType;
  scope: ScopeType;
  periodStart: string;
  categories: Category[];
  entries: Entry[];
  savings: FamilySaving[];
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (denyWithoutAccessCode(request, response)) return;
    if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });

    const scope = (request.body.scope || "personal") as ScopeType;
    const person = String(request.body.person || "yangbao");
    const periodType = (request.body.periodType || "month") as PeriodType;
    const periodStart = request.body.periodStart as string;
    const question = request.body.question || "本期收支结构有什么问题？";
    const entryQuery = new URLSearchParams({
      select: "*",
      period_type: `eq.${periodType}`,
      period_start: `eq.${periodStart}`,
      order: "created_at.asc"
    });
    if (scope === "personal") {
      entryQuery.set("scope", "eq.personal");
      entryQuery.set("person", `eq.${person}`);
    }
    const savingQuery = new URLSearchParams({
      select: "*",
      period_type: `eq.${periodType}`,
      period_start: `eq.${periodStart}`,
      order: "created_at.asc"
    });

    const [categories, entries, savings] = await Promise.all([
      supabaseRest<Category[]>("ledger_categories?select=*&order=sort_order.asc"),
      supabaseRest<Entry[]>(`ledger_entries?${entryQuery.toString()}`),
      scope === "family" ? supabaseRest<FamilySaving[]>(`family_savings?${savingQuery.toString()}`) : Promise.resolve([])
    ]);

    const analysis = await runModelAnalysis({
      question,
      scope,
      periodType,
      periodStart,
      categories,
      entries,
      savings
    });

    response.status(200).json({ analysis });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unexpected API error" });
  }
}

async function runModelAnalysis(input: AnalysisInput) {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { text: fallbackAnalysis(input), source: "fallback", error: "缺少模型 API Key，已使用本地规则分析。" };
  }

  const baseUrl = stripTrailingSlash(
    process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"
  );
  const model = process.env.AI_MODEL || process.env.OPENAI_MODEL || "qwen-plus";

  try {
    const result = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "你是我们家的财务管家“钱多多”。请用乖巧可爱、心细、缜密、细腻的中文语气称呼用户为“我们家”。只基于提供的数据做判断，不编造。不要输出 JSON、代码块、Markdown 表格或大段数据罗列。输出 2 到 4 段结论文字，先说结论，再说最值得注意的一两点，最后给温柔但明确的行动建议。整体保持简短。"
          },
          {
            role: "user",
            content: buildAnalysisPrompt(input)
          }
        ]
      })
    });

    if (!result.ok) {
      return {
        text: fallbackAnalysis(input),
        source: "fallback",
        model,
        error: `模型接口返回 ${result.status}：${(await result.text()).slice(0, 240)}`
      };
    }

    const data = await result.json();
    const text = data.choices?.[0]?.message?.content;
    return text
      ? { text, source: "model", model }
      : { text: fallbackAnalysis(input), source: "fallback", model, error: "模型接口没有返回可用文本。" };
  } catch (error) {
    return {
      text: fallbackAnalysis(input),
      source: "fallback",
      model,
      error: error instanceof Error ? error.message : "模型请求失败。"
    };
  }
}

function buildAnalysisPrompt(input: AnalysisInput) {
  const summary = summarizeLedger(input);
  const scopeLabel = input.scope === "family" ? "家庭" : "个人";
  const periodLabel = input.periodType === "year" ? "年度" : "月度";
  const categoryLines = summary.categories
    .slice(0, 6)
    .map((category) => `${category.name}：${formatMoney(category.amount)}（${category.flowType === "income" ? "收入" : "支出"}）`)
    .join("\n");
  const savingLines =
    input.scope === "family"
      ? input.savings
          .slice(0, 6)
          .map((saving) => `${saving.source_name}：${formatMoney(Number(saving.amount) || 0)}`)
          .join("\n")
      : "";

  return [
    `我们家的问题：${input.question || "本期表现如何？"}`,
    `范围：${scopeLabel}${periodLabel}，周期开始：${input.periodStart}`,
    `收入：${formatMoney(summary.income)}`,
    `支出：${formatMoney(summary.expense)}`,
    `结余：${formatMoney(summary.savings)}`,
    `成本率：${Math.round(summary.expenseRatio * 100)}%`,
    input.scope === "family" ? `家庭储蓄金：${formatMoney(summary.saved)}` : "",
    categoryLines ? `主要分类：\n${categoryLines}` : "主要分类：暂无",
    savingLines ? `储蓄来源：\n${savingLines}` : "",
    "请直接输出给用户看的自然语言结论，不要列原始表格。"
  ]
    .filter(Boolean)
    .join("\n");
}

function summarizeLedger(input: Omit<AnalysisInput, "question">) {
  const categoryMap = new Map(input.categories.map((category) => [category.id, category]));
  let income = 0;
  let expense = 0;
  let saved = 0;
  const byCategory = new Map<string, { name: string; amount: number; flowType: string }>();

  for (const entry of input.entries) {
    const category = categoryMap.get(entry.category_id);
    const flowType = category?.flow_type || "expense";
    const amount = Number(entry.amount) || 0;
    if (flowType === "income") income += amount;
    if (flowType === "expense") expense += amount;
    const name = category?.name || "未分类";
    const bucket = byCategory.get(name) || { name, amount: 0, flowType };
    bucket.amount += amount;
    byCategory.set(name, bucket);
  }
  for (const saving of input.savings || []) saved += Number(saving.amount) || 0;

  const categories = Array.from(byCategory.values()).sort((a, b) => b.amount - a.amount);
  return {
    income,
    expense,
    saved,
    savings: income - expense,
    expenseRatio: income > 0 ? expense / income : 0,
    categories,
    largestExpense: categories.find((category) => category.flowType === "expense")
  };
}

function fallbackAnalysis(input: AnalysisInput) {
  const summary = summarizeLedger(input);
  const scopeLabel = input.scope === "family" ? "家庭" : "个人";
  const periodLabel = input.periodType === "year" ? "年度" : "月度";
  const top = summary.largestExpense
    ? `${summary.largestExpense.name} 是最大的成本桶，金额为 ${formatMoney(summary.largestExpense.amount)}。`
    : "当前没有成本类记录。";

  const savedText = input.scope === "family" ? `，家庭储蓄金已经有 ${formatMoney(summary.saved)}` : "";
  return [
    `钱多多看完啦，我们家这个${scopeLabel}${periodLabel}整体是：收入 ${formatMoney(summary.income)}，支出 ${formatMoney(
      summary.expense
    )}，结余 ${formatMoney(summary.savings)}${savedText}。`,
    `${top}${
      summary.expenseRatio > 0.7
        ? "钱多多会稍微敲一下小铃铛：成本率偏高，建议先看固定支出和副业投入有没有可以收紧的地方。"
        : "钱多多觉得现在节奏还算稳，可以继续观察哪些投入真的带来了回报。"
    }`,
    `针对「${input.question || "本期表现如何"}」，钱多多的乖巧建议是：先抓最大的一项，不要同时改太多，下一次复盘会更清楚。`
  ].join("\n\n");
}

function denyWithoutAccessCode(request: VercelRequest, response: VercelResponse) {
  const expected = process.env.APP_ACCESS_CODE;
  if (!expected) return false;
  if (request.headers["x-app-access-code"] === expected) return false;
  response.status(401).json({ error: "ACCESS_CODE_REQUIRED" });
  return true;
}

async function supabaseRest<T>(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase environment variables.");

  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");

  const result = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, { ...init, headers });
  if (!result.ok) throw new Error(`Supabase REST ${result.status}: ${(await result.text()).slice(0, 500)}`);
  return (await result.json()) as T;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0
  }).format(value);
}

function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
