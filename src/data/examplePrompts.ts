export type PromptCategory =
  | 'match'
  | 'price'
  | 'payment'
  | 'supplier'
  | 'mixed'
  | 'context';

export interface ExamplePrompt {
  id: string;
  category: PromptCategory;
  title: string;
  query: string;
  /** 当问题含具体 ID（如 SUP-001 / PO-2024-0035）时设 true：点击后填入输入框而不直接发送 */
  editable?: boolean;
}

export interface CategoryDef {
  key: PromptCategory;
  label: string;
  icon: string;
  description: string;
}

export const CATEGORIES: CategoryDef[] = [
  { key: 'match', label: '三路匹配', icon: '🔍', description: '检查 PO / 收货 / 发票一致性' },
  { key: 'price', label: '价格差异', icon: '💰', description: '实际价 vs 合同价偏差' },
  { key: 'payment', label: '付款合规', icon: '💳', description: '逾期、折扣、提前付款' },
  { key: 'supplier', label: '供应商绩效', icon: '📊', description: 'KPI、交付、质量' },
  { key: 'mixed', label: '综合分析', icon: '🧭', description: '跨领域探索性问题' },
  { key: 'context', label: '会话上下文', icon: '💭', description: '基于上次分析结果追问' },
];

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  // ---------- 三路匹配 ----------
  {
    id: 'match-1',
    category: 'match',
    title: '分析三路匹配发票收货异常',
    query: '分析三路匹配发票收货异常',
  },
  {
    id: 'match-2',
    category: 'match',
    title: '最近三路匹配异常总览',
    query: '请分析最近的三路匹配异常情况，看看哪些订单存在数量或金额偏差',
  },
  {
    id: 'match-3',
    category: 'match',
    title: '检查指定 PO 的三路匹配',
    query: '检查采购订单 PO-2024-0035 的三路匹配情况',
    editable: true,
  },
  {
    id: 'match-4',
    category: 'match',
    title: '开票数量与入库数量对不上',
    query: '检查一下开票数量和入库数量对不上的情况',
  },
  {
    id: 'match-5',
    category: 'match',
    title: '分析三路匹配发票异常',
    query: '分析三路匹配发票异常',
  },

  // ---------- 价格差异 ----------
  {
    id: 'price-1',
    category: 'price',
    title: '检查价格差异和合同价偏差',
    query: '检查价格差异和合同价偏差',
  },
  {
    id: 'price-2',
    category: 'price',
    title: '全供应商价格偏差排查',
    query: '分析所有供应商的采购价格差异，找出实际价格与合同价偏差较大的订单',
  },
  {
    id: 'price-3',
    category: 'price',
    title: '指定供应商价格差异',
    query: '分析供应商 SUP-001 华为科技的价格差异情况',
    editable: true,
  },
  {
    id: 'price-4',
    category: 'price',
    title: '分析价格差异',
    query: '分析价格差异',
  },
  {
    id: 'price-5',
    category: 'price',
    title: '采购成本超预算原因',
    query: '为什么最近采购成本比预算高出那么多',
  },
  {
    id: 'price-6',
    category: 'price',
    title: '指定供应商近60天价格差异',
    query: '分析 SUP-001 最近60天的价格差异',
    editable: true,
  },

  // ---------- 付款合规 ----------
  {
    id: 'pay-1',
    category: 'payment',
    title: '付款逾期与折扣滥用',
    query: '分析付款逾期和折扣滥用情况',
  },
  {
    id: 'pay-2',
    category: 'payment',
    title: '付款合规性检查',
    query: '检查付款合规性，是否存在逾期付款或提前付款的情况',
  },
  {
    id: 'pay-3',
    category: 'payment',
    title: '最近90天付款合规',
    query: '检查最近90天的付款合规情况',
  },
  {
    id: 'pay-4',
    category: 'payment',
    title: '该付未付的账单',
    query: '有没有该付钱还没付的账单',
  },
  {
    id: 'pay-5',
    category: 'payment',
    title: '最近60天付款逾期',
    query: '分析最近60天的付款逾期',
  },

  // ---------- 供应商绩效 ----------
  {
    id: 'sup-1',
    category: 'supplier',
    title: '供应商 KPI + 准时交货',
    query: '评估供应商 SUP-001 的绩效 KPI 和准时交货质量',
    editable: true,
  },
  {
    id: 'sup-2',
    category: 'supplier',
    title: '供应商绩效表现',
    query: '评估供应商 SUP-002 中兴通讯的绩效表现',
    editable: true,
  },
  {
    id: 'sup-3',
    category: 'supplier',
    title: '计算供应商 KPI',
    query: '计算供应商 SUP-003 比亚迪电子的 KPI',
    editable: true,
  },
  {
    id: 'sup-4',
    category: 'supplier',
    title: '供应商绩效评分',
    query: '分析供应商 SUP-002 的绩效评分',
    editable: true,
  },
  {
    id: 'sup-5',
    category: 'supplier',
    title: '哪些供应商总是送货迟到',
    query: '哪些供应商送货总是迟到',
  },
  {
    id: 'sup-6',
    category: 'supplier',
    title: '评估指定供应商交货质量',
    query: '评估供应商 SUP-999 的绩效和交货质量',
    editable: true,
  },

  // ---------- 综合 / 探索性 ----------
  {
    id: 'mix-1',
    category: 'mixed',
    title: '采购数据全面分析',
    query: '帮我全面分析一下最近的采购数据，包括三路匹配、价格差异、付款合规和供应商绩效',
  },
  {
    id: 'mix-2',
    category: 'mixed',
    title: '最近有什么异常',
    query: '最近采购有什么异常吗？',
  },
  {
    id: 'mix-3',
    category: 'mixed',
    title: '给我看看采购数据',
    query: '给我看看采购数据',
  },
  {
    id: 'mix-4',
    category: 'mixed',
    title: '采购员谈判能力评估',
    query: '哪些采购员的价格谈判能力比较弱',
  },
  {
    id: 'mix-5',
    category: 'mixed',
    title: '质量投诉与付款节奏关联',
    query: 'SUP-001 质量投诉变多了，是否也影响了付款节奏',
    editable: true,
  },

  // ---------- 会话上下文 ----------
  {
    id: 'ctx-1',
    category: 'context',
    title: '上次最严重的异常',
    query: '上次分析中最严重的异常是哪个',
  },
];
