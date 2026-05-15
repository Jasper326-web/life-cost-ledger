# 生活成本记录

新粗野主义风格的收入/成本记录网站。支持个人/家庭、月度/年度切换、可新增开支类型与子项、图表结果页，以及基于 Supabase 数据的 AI 分析。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase

执行 `supabase/migrations/202605060001_cost_ledger.sql` 创建表、RLS 和示例数据。

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
