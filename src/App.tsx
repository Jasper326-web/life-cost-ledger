import { FormEvent, useEffect, useMemo, useState } from "react";

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
  note?: string;
};

const defaultCategories: Category[] = [
  { id: "income", name: "收入", flow_type: "income", sort_order: 0 },
  { id: "life", name: "生活成本", flow_type: "expense", sort_order: 1 },
  { id: "side", name: "副业投入类", flow_type: "expense", sort_order: 2 }
];

const demoEntries: Entry[] = [
  {
    id: "demo-1",
    category_id: "income",
    scope: "personal",
    period_type: "month",
    period_start: currentPeriod("month"),
    item_name: "主业收入",
    amount: 18000,
    note: "演示数据"
  },
  {
    id: "demo-2",
    category_id: "life",
    scope: "personal",
    period_type: "month",
    period_start: currentPeriod("month"),
    item_name: "房租与餐食",
    amount: 8200,
    note: "可删除后换成真实记录"
  },
  {
    id: "demo-3",
    category_id: "side",
    scope: "personal",
    period_type: "month",
    period_start: currentPeriod("month"),
    item_name: "工具订阅",
    amount: 1280,
    note: "副业投入"
  }
];

export function App() {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [scope, setScope] = useState<ScopeType>("personal");
  const [periodStart, setPeriodStart] = useState(currentPeriod("month"));
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [entries, setEntries] = useState<Entry[]>(demoEntries);
  const [activeCategoryId, setActiveCategoryId] = useState("life");
  const [question, setQuestion] = useState("本期哪些成本需要优先优化？");
  const [analysis, setAnalysis] = useState("连接 Supabase 后，会基于数据库记录回答；本地也会保留演示视图。");
  const [accessCode, setAccessCode] = useState(() => localStorage.getItem("appAccessCode") || "");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setPeriodStart(currentPeriod(periodType));
  }, [periodType]);

  useEffect(() => {
    void loadLedger();
  }, [scope, periodType, periodStart]);

  const visibleEntries = useMemo(
    () =>
      entries.filter(
        (entry) => entry.scope === scope && entry.period_type === periodType && entry.period_start === periodStart
      ),
    [entries, periodStart, periodType, scope]
  );

  const activeCategory = categories.find((category) => category.id === activeCategoryId) || categories[0];
  const activeEntries = visibleEntries.filter((entry) => entry.category_id === activeCategory?.id);
  const summary = summarize(categories, visibleEntries);
  const chartRows = summary.byCategory.filter((row) => row.amount > 0);

  async function loadLedger() {
    setNotice("");
    const query = new URLSearchParams({ scope, periodType, periodStart });
    const response = await apiFetch(`/api/ledger?${query.toString()}`, { accessCode });

    if (!response.ok) {
      if (response.status === 401) setNotice("需要访问码：请输入 APP_ACCESS_CODE。");
      return;
    }

    const data = (await response.json()) as { categories?: Category[]; entries?: Entry[] };
    if (data.categories?.length) {
      setCategories(data.categories);
      if (!data.categories.some((category) => category.id === activeCategoryId)) {
        setActiveCategoryId(data.categories[0].id);
      }
    }
    if (data.entries?.length) setEntries(data.entries);
  }

  async function addCategory() {
    const name = window.prompt("新开支类型名称");
    if (!name) return;

    const optimistic: Category = {
      id: `local-${crypto.randomUUID()}`,
      name,
      flow_type: "expense",
      sort_order: categories.length + 1
    };
    setCategories((current) => [...current, optimistic]);
    setActiveCategoryId(optimistic.id);

    const response = await apiFetch("/api/categories", {
      method: "POST",
      accessCode,
      body: JSON.stringify({ name, flow_type: "expense" })
    });
    if (response.ok) {
      const saved = (await response.json()) as Category;
      setCategories((current) => current.map((category) => (category.id === optimistic.id ? saved : category)));
      setActiveCategoryId(saved.id);
    } else {
      setNotice("分类已先加到本地；Supabase 连接好后会写入数据库。");
    }
  }

  async function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCategory) return;

    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const itemName = String(form.get("item_name") || "").trim();
    if (!itemName || !Number.isFinite(amount) || amount <= 0) return;

    const nextEntry: Entry = {
      id: `local-${crypto.randomUUID()}`,
      category_id: activeCategory.id,
      scope,
      period_type: periodType,
      period_start: periodStart,
      item_name: itemName,
      amount,
      note: String(form.get("note") || "")
    };
    setEntries((current) => [...current, nextEntry]);
    event.currentTarget.reset();

    const response = await apiFetch("/api/ledger", {
      method: "POST",
      accessCode,
      body: JSON.stringify(nextEntry)
    });
    if (response.ok) {
      const saved = (await response.json()) as Entry;
      setEntries((current) => current.map((entry) => (entry.id === nextEntry.id ? saved : entry)));
    } else {
      setNotice("记录已先保存在本地视图；Supabase 环境变量完成后可写入数据库。");
    }
  }

  async function deleteEntry(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
    if (!id.startsWith("local-") && !id.startsWith("demo-")) {
      await apiFetch(`/api/entries/${id}`, { method: "DELETE", accessCode });
    }
  }

  async function askAi() {
    setIsLoading(true);
    setAnalysis("分析中...");
    const response = await apiFetch("/api/analyze", {
      method: "POST",
      accessCode,
      body: JSON.stringify({ question, scope, periodType, periodStart })
    });

    if (response.ok) {
      const data = (await response.json()) as { analysis: string };
      setAnalysis(data.analysis);
    } else {
      setAnalysis(makeLocalAnalysis(question, summary));
    }
    setIsLoading(false);
  }

  function saveAccessCode() {
    localStorage.setItem("appAccessCode", accessCode);
    void loadLedger();
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">¥</div>
          <div>
            <h1>生活成本记录</h1>
            <p>收入 / 成本 / 副业投入，一张表看清。</p>
          </div>
        </div>
        <div className="switches">
          <Segmented value={periodType} options={[["month", "月度"], ["year", "年度"]]} onChange={setPeriodType} />
          <Segmented value={scope} options={[["personal", "个人"], ["family", "家庭"]]} onChange={setScope} />
        </div>
      </header>

      <section className="periodRail">
        <button type="button" onClick={() => setPeriodStart(shiftPeriod(periodStart, periodType, -1))} aria-label="上一个周期">
          ‹
        </button>
        <strong>{formatPeriod(periodStart, periodType)}</strong>
        <button type="button" onClick={() => setPeriodStart(shiftPeriod(periodStart, periodType, 1))} aria-label="下一个周期">
          ›
        </button>
        <input type={periodType === "month" ? "month" : "number"} value={periodInputValue(periodStart, periodType)} onChange={(event) => setPeriodStart(normalizePeriod(event.target.value, periodType))} />
      </section>

      {notice && (
        <section className="accessPanel">
          <strong>{notice}</strong>
          <input value={accessCode} onChange={(event) => setAccessCode(event.target.value)} placeholder="输入访问码" type="password" />
          <button type="button" onClick={saveAccessCode}>
            解锁
          </button>
        </section>
      )}

      <section className="kpis">
        <Kpi tone="yellow" label="收入" value={formatMoney(summary.income)} mark="¥" />
        <Kpi tone="coral" label="成本" value={formatMoney(summary.expense)} mark="□" />
        <Kpi tone="green" label="结余" value={formatMoney(summary.savings)} mark="+" />
        <Kpi tone="cyan" label="成本率" value={`${Math.round(summary.expenseRatio * 100)}%`} mark="%" />
      </section>

      <section className="workspace">
        <section className="ledgerPanel">
          <div className="tabs">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={category.id === activeCategoryId ? "selected" : ""}
                onClick={() => setActiveCategoryId(category.id)}
              >
                <span>{category.flow_type === "income" ? "入" : "出"}</span>
                {category.name}
              </button>
            ))}
            <button type="button" className="addTab" onClick={addCategory} aria-label="添加类型">
              +
            </button>
          </div>

          <div className="panelHeader">
            <div>
              <p>当前分类</p>
              <h2>{activeCategory?.name}</h2>
            </div>
            <span>{activeCategory?.flow_type === "income" ? "收入类" : "成本类"}</span>
          </div>

          <div className="entryTable">
            <div className="entryHead">
              <span>开项名称</span>
              <span>资金投入</span>
              <span>备注</span>
              <span />
            </div>
            {activeEntries.map((entry) => (
              <div className="entryRow" key={entry.id}>
                <strong>{entry.item_name}</strong>
                <span>{formatMoney(entry.amount)}</span>
                <span>{entry.note || "无"}</span>
                <button type="button" onClick={() => void deleteEntry(entry.id)} aria-label="删除">
                  ×
                </button>
              </div>
            ))}
            <form className="entryRow newRow" onSubmit={addEntry}>
              <input name="item_name" placeholder="例如：房租 / 工具订阅" />
              <input name="amount" placeholder="0" type="number" min="0" />
              <input name="note" placeholder="可选" />
              <button type="submit" aria-label="添加子项">
                +
              </button>
            </form>
          </div>
        </section>

        <aside className="aiPanel">
          <div className="panelHeader">
            <div>
              <p>AI 分析</p>
              <h2>问自己的数据库</h2>
            </div>
            <div className="bigIcon">AI</div>
          </div>
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} />
          <button className="askButton" type="button" onClick={() => void askAi()} disabled={isLoading}>
            {isLoading ? "分析中" : "生成分析"}
          </button>
          <pre>{analysis}</pre>
        </aside>
      </section>

      <section className="charts">
        <article className="chartPanel">
          <div className="chartTitle">
            <span>▮</span>
            <h3>分类金额</h3>
          </div>
          <BarChart rows={chartRows} />
        </article>
        <article className="chartPanel">
          <div className="chartTitle">
            <span>◉</span>
            <h3>成本结构</h3>
          </div>
          <DonutChart rows={chartRows.filter((row) => row.flowType === "expense")} />
        </article>
        <article className="chartPanel">
          <div className="chartTitle">
            <span>⌁</span>
            <h3>图表说明</h3>
          </div>
          <p className="chartCopy">{describeCharts(summary)}</p>
        </article>
      </section>
    </main>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map(([option, label]) => (
        <button key={option} type="button" className={option === value ? "selected" : ""} onClick={() => onChange(option)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Kpi({ tone, label, value, mark }: { tone: string; label: string; value: string; mark: string }) {
  return (
    <article className={`kpi ${tone}`}>
      <div>{mark}</div>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function BarChart({ rows }: { rows: ReturnType<typeof summarize>["byCategory"] }) {
  const max = Math.max(...rows.map((row) => row.amount), 1);
  return (
    <div className="barViz">
      {rows.map((row) => (
        <div className="barRow" key={row.name}>
          <span>{row.name}</span>
          <div>
            <i style={{ width: `${Math.max((row.amount / max) * 100, 4)}%` }} />
          </div>
          <strong>{formatMoney(row.amount)}</strong>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ rows }: { rows: ReturnType<typeof summarize>["byCategory"] }) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const segments = rows.reduce(
    (acc, row, index) => {
      const start = acc.cursor;
      const size = total > 0 ? (row.amount / total) * 100 : 0;
      const end = start + size;
      acc.parts.push(`${palette[index % palette.length]} ${start}% ${end}%`);
      acc.cursor = end;
      return acc;
    },
    { cursor: 0, parts: [] as string[] }
  );

  return (
    <div className="donutWrap">
      <div className="donut" style={{ background: `conic-gradient(${segments.parts.join(", ") || "#eee 0 100%"})` }}>
        <span>{total ? `${Math.round((rows[0]?.amount || 0) / total * 100)}%` : "0%"}</span>
      </div>
      <div className="legend">
        {rows.slice(0, 4).map((row, index) => (
          <span key={row.name}>
            <i style={{ background: palette[index % palette.length] }} />
            {row.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function summarize(categories: Category[], entries: Entry[]) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const byCategory = new Map<string, { name: string; amount: number; flowType: FlowType }>();
  let income = 0;
  let expense = 0;

  for (const entry of entries) {
    const category = categoryMap.get(entry.category_id);
    const flowType = category?.flow_type || "expense";
    if (flowType === "income") income += Number(entry.amount) || 0;
    if (flowType === "expense") expense += Number(entry.amount) || 0;
    const name = category?.name || "未分类";
    const row = byCategory.get(name) || { name, amount: 0, flowType };
    row.amount += Number(entry.amount) || 0;
    byCategory.set(name, row);
  }

  return {
    income,
    expense,
    savings: income - expense,
    expenseRatio: income > 0 ? expense / income : 0,
    byCategory: Array.from(byCategory.values()).sort((a, b) => b.amount - a.amount)
  };
}

function describeCharts(summary: ReturnType<typeof summarize>) {
  const top = summary.byCategory.find((row) => row.flowType === "expense");
  if (!top) return "当前周期还没有成本记录。添加子项后，这里会说明最大成本项、成本率和现金流状态。";
  return `当前最大成本项是 ${top.name}，金额 ${formatMoney(top.amount)}。总成本率为 ${Math.round(
    summary.expenseRatio * 100
  )}%，结余为 ${formatMoney(summary.savings)}。`;
}

function makeLocalAnalysis(question: string, summary: ReturnType<typeof summarize>) {
  return `本地分析：针对「${question}」，当前收入 ${formatMoney(summary.income)}，成本 ${formatMoney(
    summary.expense
  )}，结余 ${formatMoney(summary.savings)}。${describeCharts(summary)}`;
}

async function apiFetch(path: string, init: RequestInit & { accessCode?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (init.accessCode) headers.set("x-app-access-code", init.accessCode);
  return fetch(path, { ...init, headers });
}

function currentPeriod(type: PeriodType) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return type === "year" ? `${year}-01-01` : `${year}-${month}-01`;
}

function periodInputValue(periodStart: string, type: PeriodType) {
  return type === "year" ? periodStart.slice(0, 4) : periodStart.slice(0, 7);
}

function normalizePeriod(value: string, type: PeriodType) {
  return type === "year" ? `${value || new Date().getFullYear()}-01-01` : `${value || periodInputValue(currentPeriod("month"), "month")}-01`;
}

function shiftPeriod(periodStart: string, type: PeriodType, direction: number) {
  const date = new Date(`${periodStart}T00:00:00`);
  if (type === "year") date.setFullYear(date.getFullYear() + direction);
  else date.setMonth(date.getMonth() + direction);
  return type === "year"
    ? `${date.getFullYear()}-01-01`
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatPeriod(periodStart: string, type: PeriodType) {
  return type === "year" ? `${periodStart.slice(0, 4)} 年` : `${periodStart.slice(0, 4)} 年 ${periodStart.slice(5, 7)} 月`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0
  }).format(value);
}

const palette = ["#ffcf24", "#ff6b4a", "#55d17a", "#57c7ff", "#c084fc"];
