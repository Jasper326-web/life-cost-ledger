import type { Category, Entry, PeriodType, ScopeType } from "./types";

type AnalysisInput = {
  question: string;
  periodType: PeriodType;
  scope: ScopeType;
  periodStart: string;
  categories: Category[];
  entries: Entry[];
};

export type AnalysisResult = {
  text: string;
  source: "model" | "fallback";
  model?: string;
  error?: string;
};

export function summarizeLedger(input: Omit<AnalysisInput, "question">) {
  const categoryMap = new Map(input.categories.map((category) => [category.id, category]));
  const totals = input.entries.reduce(
    (acc, entry) => {
      const category = categoryMap.get(entry.category_id);
      const flowType = category?.flow_type || "expense";
      const amount = Number(entry.amount) || 0;
      if (flowType === "income") acc.income += amount;
      if (flowType === "expense") acc.expense += amount;
      const bucket = acc.byCategory.get(category?.name || "未分类") || {
        name: category?.name || "未分类",
        amount: 0,
        flowType
      };
      bucket.amount += amount;
      acc.byCategory.set(bucket.name, bucket);
      return acc;
    },
    {
      income: 0,
      expense: 0,
      byCategory: new Map<string, { name: string; amount: number; flowType: string }>()
    }
  );

  const savings = totals.income - totals.expense;
  const expenseRatio = totals.income > 0 ? totals.expense / totals.income : 0;
  const categories = Array.from(totals.byCategory.values()).sort((a, b) => b.amount - a.amount);
  const largestExpense = categories.find((category) => category.flowType === "expense");

  return { income: totals.income, expense: totals.expense, savings, expenseRatio, categories, largestExpense };
}

export function fallbackAnalysis(input: AnalysisInput) {
  const summary = summarizeLedger(input);
  const scopeLabel = input.scope === "family" ? "家庭" : "个人";
  const periodLabel = input.periodType === "year" ? "年度" : "月度";
  const ratioText = `${Math.round(summary.expenseRatio * 100)}%`;
  const top = summary.largestExpense
    ? `${summary.largestExpense.name} 是最大的成本桶，金额为 ${formatMoney(summary.largestExpense.amount)}。`
    : "当前没有成本类记录。";

  return [
    `${scopeLabel}${periodLabel}概览：收入 ${formatMoney(summary.income)}，成本 ${formatMoney(
      summary.expense
    )}，结余 ${formatMoney(summary.savings)}，成本率 ${ratioText}。`,
    `针对「${input.question || "本期表现如何"}」：${top}${
      summary.expenseRatio > 0.7 ? "成本率偏高，建议先检查固定支出和副业投入上限。" : "成本率处在可控区间，可以继续观察投入回报。"
    }`
  ].join("\n\n");
}

export async function runModelAnalysis(input: AnalysisInput) {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      text: fallbackAnalysis(input),
      source: "fallback",
      error: "缺少模型 API Key，已使用本地规则分析。"
    } satisfies AnalysisResult;
  }

  const baseUrl = stripTrailingSlash(
    process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"
  );
  const model = process.env.AI_MODEL || process.env.OPENAI_MODEL || "qwen-plus";

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
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
            content: "你是务实的中文财务分析助手。只基于给定 JSON 分析，不编造数据。输出概览、风险、建议。"
          },
          {
            role: "user",
            content: JSON.stringify({ ...input, summary: summarizeLedger(input) })
          }
        ]
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        text: fallbackAnalysis(input),
        source: "fallback",
        model,
        error: `模型接口返回 ${response.status}：${detail.slice(0, 240)}`
      } satisfies AnalysisResult;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      return {
        text: fallbackAnalysis(input),
        source: "fallback",
        model,
        error: "模型接口没有返回可用文本，已使用本地规则分析。"
      } satisfies AnalysisResult;
    }

    return { text, source: "model", model } satisfies AnalysisResult;
  } catch (error) {
    return {
      text: fallbackAnalysis(input),
      source: "fallback",
      model,
      error: error instanceof Error ? error.message : "模型请求失败。"
    } satisfies AnalysisResult;
  }
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0
  }).format(value);
}

function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
