# 生活成本记录

新粗野主义风格的收入/成本记录网站。支持个人/家庭、月度/年度切换、可新增开支类型与子项、图表结果页，以及基于 Supabase 数据的 AI 分析。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase

按 `supabase/migrations` 里的顺序执行 SQL，创建表、RLS、索引和基础数据。

### 表关系

`ledger_categories` 是顶部 tab/分类表：

- `id`：分类主键。
- `name`：展示名称，例如收入、生活成本、副业投入。
- `flow_type`：`income` 表示收入类，`expense` 表示成本类。

`ledger_entries` 是每个 tab 下的子项/明细表：

- `category_id`：关联 `ledger_categories.id`，决定这条明细属于哪个 tab。
- `person`：关联 `ledger_people.code`，区分阳宝、雨宝。
- `scope`：`personal` 表示个人记录，`family` 表示家庭共同记录。
- `period_type` + `period_start`：决定这条记录属于哪个月或哪一年。
- `item_name` + `amount`：子项名称和金额。
- `is_recurring`：是否为长期固定项。勾选后，可在下个周期用“一键迁移上期固定项”复制过来。

`ledger_people` 是人物字典表：

- `code`：人物稳定标识，目前是 `yangbao` / `yubao`。
- `display_name`：页面展示名，阳宝 / 雨宝。

`family_savings` 是家庭储蓄金表，和收入/成本明细分开：

- `person`：关联 `ledger_people.code`，标记这笔储蓄来源归属。
- `period_type` + `period_start`：决定储蓄属于哪个月或哪一年。
- `source_name` + `amount`：储蓄来源和已储蓄金额。

汇总逻辑：

- 个人模式：只统计 `scope = personal` 且 `person` 等于当前人物的 `ledger_entries`。
- 家庭模式：统计所有 `ledger_entries`，也就是阳宝、雨宝和家庭共同记录合并。
- 家庭储蓄金：来自 `family_savings`，单独入表，但会进入 KPI 和图表说明。
- 迁移逻辑：个人模式迁移当前人物上个周期的长期固定项；家庭模式迁移上个周期所有长期固定项，并按分类、归属、人物、条目名称去重。

环境变量：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`：推荐，用于服务端 API
- `SUPABASE_PUBLISHABLE_KEY`：可选 fallback
- `APP_ACCESS_CODE`：可选，给部署后的 API 加一层访问码
- `DASHSCOPE_API_KEY`：可选，启用百炼 / DashScope 模型分析
- `AI_BASE_URL`：可选，默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`
- `AI_MODEL`：可选，默认 `qwen-plus`
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`：兼容 OpenAI-style 配置

## 部署

Vercel 项目需要配置上述环境变量。没有模型 API Key 时，分析页仍会基于数据库数据生成规则分析。
