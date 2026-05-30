import { FormEvent, useEffect, useMemo, useState } from "react";

type PeriodType = "month" | "year";
type ScopeType = "personal" | "family";
type FlowType = "income" | "expense";
type PersonType = "yangbao" | "yubao";
type ChartFlowType = FlowType | "saving";

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
  person: PersonType;
  period_type: PeriodType;
  period_start: string;
  item_name: string;
  amount: number;
  note?: string;
  is_recurring?: boolean;
};

type FamilySaving = {
  id: string;
  period_type: PeriodType;
  period_start: string;
  person: PersonType;
  source_name: string;
  amount: number;
  note?: string;
};

type AnalysisResponse = {
  analysis:
    | string
    | {
        text: string;
        source: "model" | "fallback";
        model?: string;
        error?: string;
      };
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
    person: "yangbao",
    period_type: "month",
    period_start: currentPeriod("month"),
    item_name: "主业收入",
    amount: 18000,
    note: "演示数据",
    is_recurring: true
  },
  {
    id: "demo-2",
    category_id: "life",
    scope: "personal",
    person: "yangbao",
    period_type: "month",
    period_start: currentPeriod("month"),
    item_name: "房租与餐食",
    amount: 8200,
    note: "可删除后换成真实记录",
    is_recurring: true
  },
  {
    id: "demo-3",
    category_id: "side",
    scope: "personal",
    person: "yangbao",
    period_type: "month",
    period_start: currentPeriod("month"),
    item_name: "工具订阅",
    amount: 1280,
    note: "副业投入",
    is_recurring: false
  }
];

export function App() {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [scope, setScope] = useState<ScopeType>("personal");
  const [person, setPerson] = useState<PersonType>("yangbao");
  const [periodStart, setPeriodStart] = useState(currentPeriod("month"));
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [entries, setEntries] = useState<Entry[]>(demoEntries);
  const [savings, setSavings] = useState<FamilySaving[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState("life");
  const [question, setQuestion] = useState("本期哪些成本需要优先优化？");
  const [analysis, setAnalysis] = useState("连接 Supabase 后，会基于数据库记录回答；本地也会保留演示视图。");
  const [analysisSource, setAnalysisSource] = useState<"idle" | "model" | "fallback" | "error">("idle");
  const [notice, setNotice] = useState("");
  const [syncStatus, setSyncStatus] = useState("本地演示数据");
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  useEffect(() => {
    setPeriodStart(currentPeriod(periodType));
  }, [periodType]);

  useEffect(() => {
    void loadLedger();
  }, [scope, person, periodType, periodStart]);

  const visibleEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.period_type === periodType &&
          entry.period_start === periodStart &&
          (scope === "family" || (entry.scope === "personal" && entry.person === person))
      ),
    [entries, periodStart, periodType, scope, person]
  );

  const activeCategory = categories.find((category) => category.id === activeCategoryId) || categories[0];
  const activeEntries = visibleEntries.filter((entry) => entry.category_id === activeCategory?.id);
  const visibleSavings =
    scope === "family" ? savings.filter((saving) => saving.period_type === periodType && saving.period_start === periodStart) : [];
  const summary = summarize(categories, visibleEntries, visibleSavings);
  const chartRows = summary.byCategory.filter((row) => row.amount > 0);

  async function loadLedger() {
    setNotice("");
    const query = new URLSearchParams({ scope, person, periodType, periodStart });
    const response = await apiFetch(`/api/ledger?${query.toString()}`);

    if (!response.ok) {
      const message = await readApiError(response);
      setNotice(`数据库读取失败：${message}`);
      setSyncStatus(`数据库读取失败（${response.status}），当前显示本地数据`);
      return;
    }

    const data = (await response.json()) as { categories?: Category[]; entries?: Entry[]; savings?: FamilySaving[] };
    if (data.categories?.length) {
      setCategories(data.categories);
      if (!data.categories.some((category) => category.id === activeCategoryId)) {
        setActiveCategoryId(data.categories[0].id);
      }
    }
    if (data.entries) setEntries(data.entries);
    if (data.savings) setSavings(data.savings);
    setSyncStatus("已连接 Supabase，页面数据来自数据库");
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const flowType = form.get("flow_type") === "income" ? "income" : "expense";
    if (!name) return;

    const optimistic: Category = {
      id: `local-${crypto.randomUUID()}`,
      name,
      flow_type: flowType,
      sort_order: categories.length + 1
    };
    setCategories((current) => [...current, optimistic]);
    setActiveCategoryId(optimistic.id);
    event.currentTarget.reset();
    setIsAddingCategory(false);

    const response = await apiFetch("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name, flow_type: flowType })
    });
    if (response.ok) {
      const saved = (await response.json()) as Category;
      setCategories((current) => current.map((category) => (category.id === optimistic.id ? saved : category)));
      setActiveCategoryId(saved.id);
      setSyncStatus("分类已保存到数据库");
    } else {
      const message = await readApiError(response);
      setCategories((current) => current.filter((category) => category.id !== optimistic.id));
      setActiveCategoryId(categories[0]?.id || "");
      setNotice(`分类保存失败：${message}`);
      setSyncStatus(`分类保存到数据库失败（${response.status}）`);
    }
  }

  async function deleteCategory(category: Category) {
    if (categories.length <= 1) {
      setNotice("至少需要保留一个分类。");
      return;
    }
    const confirmed = window.confirm(`删除「${category.name}」？该分类下的明细也会一起删除。`);
    if (!confirmed) return;

    const previousCategories = categories;
    const previousEntries = entries;
    const nextCategories = categories.filter((item) => item.id !== category.id);
    setCategories(nextCategories);
    setEntries((current) => current.filter((entry) => entry.category_id !== category.id));
    if (activeCategoryId === category.id) setActiveCategoryId(nextCategories[0]?.id || "");

    if (category.id.startsWith("local-")) return;
    const response = await apiFetch(`/api/categories?id=${encodeURIComponent(category.id)}`, {
      method: "DELETE"
    });
    if (response.ok) {
      setSyncStatus("分类已删除，相关明细已同步移除");
      void loadLedger();
    } else {
      const message = await readApiError(response);
      setCategories(previousCategories);
      setEntries(previousEntries);
      setActiveCategoryId(category.id);
      setNotice(`分类删除失败：${message}`);
      setSyncStatus(`分类删除失败（${response.status}）`);
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
      scope: scope === "family" ? "family" : "personal",
      person,
      period_type: periodType,
      period_start: periodStart,
      item_name: itemName,
      amount,
      note: String(form.get("note") || ""),
      is_recurring: form.get("is_recurring") === "on"
    };
    setEntries((current) => [...current, nextEntry]);
    event.currentTarget.reset();

    const response = await apiFetch("/api/ledger", {
      method: "POST",
      body: JSON.stringify(nextEntry)
    });
    if (response.ok) {
      const saved = (await response.json()) as Entry;
      setEntries((current) => current.map((entry) => (entry.id === nextEntry.id ? saved : entry)));
      setSyncStatus("记录已保存到数据库，KPI 和图表已更新");
      void loadLedger();
    } else {
      const message = await readApiError(response);
      setEntries((current) => current.filter((entry) => entry.id !== nextEntry.id));
      setNotice(`保存失败：${message}`);
      setSyncStatus(`记录未保存到数据库（${response.status}）`);
    }
  }

  async function updateEntry(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const patch = {
      item_name: String(form.get("item_name") || "").trim(),
      amount: Number(form.get("amount")),
      note: String(form.get("note") || ""),
      is_recurring: form.get("is_recurring") === "on"
    };
    if (!patch.item_name || !Number.isFinite(patch.amount) || patch.amount < 0) return;
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
    if (id.startsWith("local-") || id.startsWith("demo-")) {
      setSyncStatus("本地演示记录已修改，真实数据请新增后保存到数据库");
      return;
    }
    const response = await apiFetch(`/api/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    setSyncStatus(response.ok ? "记录修改已保存到数据库，KPI 和图表已更新" : `记录修改保存失败（${response.status}）`);
    if (response.ok) void loadLedger();
  }

  async function deleteEntry(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
    if (!id.startsWith("local-") && !id.startsWith("demo-")) {
      const response = await apiFetch(`/api/entries/${id}`, { method: "DELETE" });
      setSyncStatus(response.ok ? "记录已从数据库删除，KPI 和图表已更新" : `数据库删除失败（${response.status}）`);
    }
  }

  async function migratePreviousPeriod() {
    const response = await apiFetch("/api/migrate", {
      method: "POST",
      body: JSON.stringify({ scope, person, periodType, periodStart })
    });
    if (response.ok) {
      const data = (await response.json()) as { inserted?: number; skipped?: number };
      setSyncStatus(`已迁移 ${data.inserted || 0} 条长期固定项，跳过 ${data.skipped || 0} 条重复项`);
      void loadLedger();
    } else {
      const message = await readApiError(response);
      setNotice(`迁移失败：${message}`);
      setSyncStatus(`上期固定项迁移失败（${response.status}）`);
    }
  }

  async function addSaving(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const sourceName = String(form.get("source_name") || "").trim();
    if (!sourceName || !Number.isFinite(amount) || amount < 0) return;

    const nextSaving: FamilySaving = {
      id: `local-${crypto.randomUUID()}`,
      period_type: periodType,
      period_start: periodStart,
      person: form.get("person") as PersonType,
      source_name: sourceName,
      amount,
      note: String(form.get("note") || "")
    };
    setSavings((current) => [...current, nextSaving]);
    event.currentTarget.reset();

    const response = await apiFetch("/api/savings", {
      method: "POST",
      body: JSON.stringify(nextSaving)
    });
    if (response.ok) {
      const saved = (await response.json()) as FamilySaving;
      setSavings((current) => current.map((saving) => (saving.id === nextSaving.id ? saved : saving)));
      setSyncStatus("家庭储蓄来源已保存，图表已更新");
      void loadLedger();
    } else {
      const message = await readApiError(response);
      setSavings((current) => current.filter((saving) => saving.id !== nextSaving.id));
      setNotice(`家庭储蓄保存失败：${message}`);
      setSyncStatus(`家庭储蓄未保存到数据库（${response.status}）`);
    }
  }

  async function updateSaving(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const patch = {
      source_name: String(form.get("source_name") || "").trim(),
      amount: Number(form.get("amount")),
      person: form.get("person") as PersonType,
      note: String(form.get("note") || "")
    };
    if (!patch.source_name || !Number.isFinite(patch.amount) || patch.amount < 0) return;
    setSavings((current) => current.map((saving) => (saving.id === id ? { ...saving, ...patch } : saving)));
    if (id.startsWith("local-")) return;
    const response = await apiFetch(`/api/savings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    setSyncStatus(response.ok ? "家庭储蓄修改已保存，图表已更新" : `家庭储蓄修改失败（${response.status}）`);
    if (response.ok) void loadLedger();
  }

  async function deleteSaving(id: string) {
    setSavings((current) => current.filter((saving) => saving.id !== id));
    if (!id.startsWith("local-")) {
      const response = await apiFetch(`/api/savings/${id}`, { method: "DELETE" });
      setSyncStatus(response.ok ? "家庭储蓄来源已删除，图表已更新" : `家庭储蓄删除失败（${response.status}）`);
    }
  }

  async function askAi() {
    setIsLoading(true);
    setAnalysis("分析中...");
    setAnalysisSource("idle");
    const response = await apiFetch("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ question, scope, person, periodType, periodStart })
    });

    if (response.ok) {
      const data = (await response.json()) as AnalysisResponse;
      if (typeof data.analysis === "string") {
        setAnalysis(data.analysis);
        setAnalysisSource("model");
      } else {
        const label =
          data.analysis.source === "model"
            ? `钱多多 · ${data.analysis.model || "model"}`
            : `钱多多的本地小算盘${data.analysis.error ? `\n原因：${data.analysis.error}` : ""}`;
        setAnalysis(`${label}\n\n${data.analysis.text}`);
        setAnalysisSource(data.analysis.source);
      }
    } else {
      setAnalysis(`接口调用失败（${response.status}），以下为本地规则分析：\n\n${makeLocalAnalysis(question, summary)}`);
      setAnalysisSource("error");
    }
    setIsLoading(false);
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
          {scope === "personal" && (
            <Segmented value={person} options={[["yangbao", "阳宝"], ["yubao", "雨宝"]]} onChange={setPerson} />
          )}
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
        </section>
      )}

      <section className="syncRail">
        <strong>同步状态</strong>
        <span>{syncStatus}</span>
      </section>

      <section className="kpis">
        <Kpi tone="yellow" label="收入" value={formatMoney(summary.income)} mark="¥" />
        <Kpi tone="coral" label="成本" value={formatMoney(summary.expense)} mark="□" />
        <Kpi tone="green" label="结余" value={formatMoney(summary.savings)} mark="+" />
        {scope === "family" && <Kpi tone="purple" label="家庭储蓄金" value={formatMoney(summary.saved)} mark="储" />}
      </section>

      <section className="workspace">
        <section className="ledgerPanel">
          <div className="tabs">
            {categories.map((category) => (
              <div key={category.id} className={`tabItem ${category.id === activeCategoryId ? "selected" : ""}`}>
                <button type="button" className="tabSelect" onClick={() => setActiveCategoryId(category.id)}>
                  <span>{category.flow_type === "income" ? "入" : "出"}</span>
                  {category.name}
                </button>
                <button type="button" className="tabDelete" onClick={() => void deleteCategory(category)} aria-label={`删除${category.name}`}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="addTab" onClick={() => setIsAddingCategory((value) => !value)} aria-label="添加类型">
              +
            </button>
          </div>
          {isAddingCategory && (
            <form className="categoryForm" onSubmit={addCategory}>
              <input name="name" placeholder="新分类名称" autoFocus />
              <select name="flow_type" defaultValue="expense">
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
              <button type="submit">保存</button>
            </form>
          )}

          <div className="panelHeader">
            <div>
              <p>当前分类</p>
              <h2>{activeCategory?.name}</h2>
            </div>
            <div className="panelActions">
              <button type="button" onClick={() => void migratePreviousPeriod()}>
                迁移上期固定项
              </button>
              <span>{activeCategory?.flow_type === "income" ? "收入类" : "成本类"}</span>
            </div>
          </div>

          <div className="entryTable">
            <div className="entryHead">
              <span>{activeCategory?.flow_type === "income" ? "收入项目" : "开支项目"}</span>
              <span>{activeCategory?.flow_type === "income" ? "收入金额" : "支出金额"}</span>
              <span>备注</span>
              <span>长期固定项</span>
              <span />
              <span />
            </div>
            {activeEntries.map((entry) => (
              <form className="entryRow" key={entry.id} onSubmit={(event) => void updateEntry(event, entry.id)}>
                <input name="item_name" defaultValue={entry.item_name} />
                <input name="amount" type="number" min="0" defaultValue={entry.amount} />
                <input name="note" defaultValue={entry.note || ""} />
                <label className="recurringCell">
                  <input name="is_recurring" type="checkbox" defaultChecked={Boolean(entry.is_recurring)} />
                  <span>是</span>
                </label>
                <button type="submit" aria-label="保存修改">
                  保存
                </button>
                <button type="button" onClick={() => void deleteEntry(entry.id)} aria-label="删除">
                  ×
                </button>
              </form>
            ))}
            <form className="entryRow newRow" onSubmit={addEntry}>
              <input name="item_name" placeholder={activeCategory?.flow_type === "income" ? "例如：工资 / 奖金" : "例如：房租 / 工具订阅"} />
              <input name="amount" placeholder="0" type="number" min="0" />
              <input name="note" placeholder="可选" />
              <label className="recurringCell">
                <input name="is_recurring" type="checkbox" />
                <span>是</span>
              </label>
              <button type="submit" aria-label="保存子项">
                保存
              </button>
              <span />
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
          <pre className={analysisSource === "model" ? "modelOutput" : ""}>{analysis}</pre>
        </aside>
      </section>

      {scope === "family" && (
        <section className="savingsPanel">
          <div className="panelHeader">
            <div>
              <p>家庭储蓄金</p>
              <h2>{formatMoney(summary.saved)}</h2>
            </div>
            <span>储蓄来源</span>
          </div>
          <div className="entryTable savingsTable">
          <div className="entryHead">
            <span>来源</span>
            <span>已储蓄金额</span>
            <span>归属</span>
            <span>备注</span>
            <span />
            <span />
          </div>
            {visibleSavings.map((saving) => (
              <form className="entryRow savingRow" key={saving.id} onSubmit={(event) => void updateSaving(event, saving.id)}>
                <input name="source_name" defaultValue={saving.source_name} />
                <input name="amount" type="number" min="0" defaultValue={saving.amount} />
                <select name="person" defaultValue={saving.person}>
                  <option value="yangbao">阳宝</option>
                  <option value="yubao">雨宝</option>
                </select>
                <input name="note" defaultValue={saving.note || ""} />
                <button type="submit">保存</button>
                <button type="button" onClick={() => void deleteSaving(saving.id)} aria-label="删除储蓄来源">
                  ×
                </button>
              </form>
            ))}
            <form className="entryRow savingRow newRow" onSubmit={addSaving}>
              <input name="source_name" placeholder="例如：定投 / 年终奖结余" />
              <input name="amount" type="number" min="0" placeholder="0" />
              <select name="person" defaultValue="yangbao">
                <option value="yangbao">阳宝</option>
                <option value="yubao">雨宝</option>
              </select>
              <input name="note" placeholder="可选" />
              <button type="submit">保存</button>
              <span />
            </form>
          </div>
        </section>
      )}

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
          <p className="chartCopy">{describeCharts(summary, scope === "family")}</p>
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

function summarize(categories: Category[], entries: Entry[], savings: FamilySaving[] = []) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const byCategory = new Map<string, { name: string; amount: number; flowType: ChartFlowType }>();
  let income = 0;
  let expense = 0;
  let saved = 0;

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

  for (const saving of savings) {
    const amount = Number(saving.amount) || 0;
    saved += amount;
    const name = `储蓄：${saving.source_name}`;
    const row = byCategory.get(name) || { name, amount: 0, flowType: "saving" as ChartFlowType };
    row.amount += amount;
    byCategory.set(name, row);
  }

  return {
    income,
    expense,
    saved,
    savings: income - expense,
    expenseRatio: income > 0 ? expense / income : 0,
    byCategory: Array.from(byCategory.values()).sort((a, b) => b.amount - a.amount)
  };
}

function describeCharts(summary: ReturnType<typeof summarize>, includeSavings = false) {
  const top = summary.byCategory.find((row) => row.flowType === "expense");
  const savingText = includeSavings ? `，家庭储蓄金为 ${formatMoney(summary.saved)}` : "";
  if (!top) return `当前周期还没有成本记录${savingText}。`;
  return `当前最大成本项是 ${top.name}，金额 ${formatMoney(top.amount)}。总成本率为 ${Math.round(
    summary.expenseRatio * 100
  )}%，结余为 ${formatMoney(summary.savings)}${savingText}。`;
}

function makeLocalAnalysis(question: string, summary: ReturnType<typeof summarize>) {
  return `本地分析：针对「${question}」，当前收入 ${formatMoney(summary.income)}，成本 ${formatMoney(
    summary.expense
  )}，结余 ${formatMoney(summary.savings)}。${describeCharts(summary)}`;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return fetch(path, { ...init, headers });
}

async function readApiError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || response.statusText;
  } catch {
    return response.statusText;
  }
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
