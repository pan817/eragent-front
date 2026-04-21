export type SuggestionPath = 'DAG' | 'ReAct' | 'Graph';

export interface Suggestion {
  icon: string;
  title: string;
  description: string;
  query: string;
  path: SuggestionPath;
}

/** 欢迎页快捷建议卡片 */
export const SUGGESTIONS: Suggestion[] = [
  {
    icon: '🔍',
    title: '检查指定 PO 三路匹配',
    description: '检查 PO-2024-0035 的 PO / 收货 / 发票一致性',
    query: '检查采购订单 PO-2024-0035 的三路匹配情况',
    path: 'DAG',
  },
  {
    icon: '📊',
    title: '供应商绩效评估',
    description: '评估中兴通讯的 KPI、交付与质量表现',
    query: '评估供应商 SUP-002 中兴通讯的绩效表现',
    path: 'DAG',
  },
  {
    icon: '🧭',
    title: '质量与付款关联',
    description: '分析 SUP-001 质量投诉对付款节奏的影响',
    query: 'SUP-001 质量投诉变多了，是否也影响了付款节奏',
    path: 'ReAct',
  },
  {
    icon: '🕸️',
    title: '采购链路追踪',
    description: '追踪 PO-2024-0035 从下单到付款的完整图谱链路',
    query: '追踪采购订单 PO-2024-0035 的完整采购链路',
    path: 'Graph',
  },
];
