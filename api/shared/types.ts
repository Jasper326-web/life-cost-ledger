export type PeriodType = "month" | "year";
export type ScopeType = "personal" | "family";
export type FlowType = "income" | "expense";

export type Category = {
  id: string;
  name: string;
  flow_type: FlowType;
  sort_order: number;
};

export type Entry = {
  id: string;
  category_id: string;
  scope: ScopeType;
  period_type: PeriodType;
  period_start: string;
  item_name: string;
  amount: number;
  note: string;
};
