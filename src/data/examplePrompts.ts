export type PromptCategory =
  | 'match'
  | 'price'
  | 'payment'
  | 'supplier'
  | 'spending'
  | 'receipt'
  | 'invoice_dup'
  | 'discount'
  | 'po_cycle'
  | 'concentration'
  | 'mixed'
  | 'context';

export type PromptPath = 'DAG' | 'ReAct' | '早退' | 'Lookup/ReAct';

export interface ExamplePrompt {
  id: string;
  category: PromptCategory;
  title: string;
  query: string;
  /** 执行路径（DAG / ReAct / 早退 / Lookup），在卡片上辅助显示 */
  path?: PromptPath;
  /** 当问题含具体 ID（如 SUP-001 / PO-2024-0035）时设 true：点击后填入输入框而不直接发送 */
  editable?: boolean;
  /** 别名/口语同义表达，用于拼音与原文搜索的补充匹配 */
  aliases?: string[];
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
  { key: 'spending', label: '采购支出', icon: '💵', description: '品类、供应商支出分布' },
  { key: 'receipt', label: '收货异常', icon: '🚚', description: '超量收货、拒收、延迟' },
  { key: 'invoice_dup', label: '发票重复', icon: '🧾', description: '重复发票与重复付款' },
  { key: 'discount', label: '折扣利用率', icon: '🏷️', description: '早付折扣机会与损失' },
  { key: 'po_cycle', label: 'PO 周期', icon: '⏱️', description: '下单到收货到付款耗时' },
  { key: 'concentration', label: '供应商集中度', icon: '🎯', description: '采购依赖与单一来源风险' },
  { key: 'mixed', label: '综合分析', icon: '🧭', description: '跨领域探索性问题' },
  { key: 'context', label: '会话上下文', icon: '💭', description: '基于上次分析结果追问' },
];

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  // ========== 三路匹配 ==========
  {
    id: 'match-1',
    category: 'match',
    title: '分析三路匹配发票收货异常',
    query: '分析三路匹配发票收货异常',
    path: 'DAG',
  },
  {
    id: 'match-2',
    category: 'match',
    title: '最近三路匹配异常总览',
    query: '请分析最近的三路匹配异常情况，看看哪些订单存在数量或金额偏差',
    path: 'DAG',
  },
  {
    id: 'match-3',
    category: 'match',
    title: '检查指定 PO 的三路匹配',
    query: '检查采购订单 PO-2024-0035 的三路匹配情况',
    path: 'DAG',
    editable: true,
  },
  {
    id: 'match-4',
    category: 'match',
    title: '开票数量与入库数量对不上',
    query: '检查一下开票数量和入库数量对不上的情况',
    path: 'DAG',
  },
  {
    id: 'match-5',
    category: 'match',
    title: '分析三路匹配发票异常',
    query: '分析三路匹配发票异常',
    path: 'DAG',
  },

  // ========== 价格差异 ==========
  {
    id: 'price-1',
    category: 'price',
    title: '检查价格差异和合同价偏差',
    query: '检查价格差异和合同价偏差',
    path: 'DAG',
  },
  {
    id: 'price-2',
    category: 'price',
    title: '全供应商价格偏差排查',
    query: '分析所有供应商的采购价格差异，找出实际价格与合同价偏差较大的订单',
    path: 'DAG',
  },
  {
    id: 'price-3',
    category: 'price',
    title: '指定供应商价格差异',
    query: '分析供应商 SUP-001 华为科技的价格差异情况',
    path: 'DAG',
    editable: true,
  },
  {
    id: 'price-4',
    category: 'price',
    title: '分析价格差异',
    query: '分析价格差异',
    path: 'DAG',
  },
  {
    id: 'price-5',
    category: 'price',
    title: '采购成本超预算原因',
    query: '为什么最近采购成本比预算高出那么多',
    path: 'DAG',
  },
  {
    id: 'price-6',
    category: 'price',
    title: '指定供应商近60天价格差异',
    query: '分析 SUP-001 最近60天的价格差异',
    path: 'DAG',
    editable: true,
  },

  // ========== 付款合规 ==========
  {
    id: 'pay-1',
    category: 'payment',
    title: '付款逾期与折扣滥用',
    query: '分析付款逾期和折扣滥用情况',
    path: 'DAG',
  },
  {
    id: 'pay-2',
    category: 'payment',
    title: '付款合规性检查',
    query: '检查付款合规性，是否存在逾期付款或提前付款的情况',
    path: 'DAG',
  },
  {
    id: 'pay-3',
    category: 'payment',
    title: '最近90天付款合规',
    query: '检查最近90天的付款合规情况',
    path: 'DAG',
  },
  {
    id: 'pay-4',
    category: 'payment',
    title: '该付未付的账单',
    query: '有没有该付钱还没付的账单',
    path: 'DAG',
  },
  {
    id: 'pay-5',
    category: 'payment',
    title: '最近60天付款逾期',
    query: '分析最近60天的付款逾期',
    path: 'DAG',
  },

  // ========== 供应商绩效 ==========
  {
    id: 'sup-1',
    category: 'supplier',
    title: '供应商 KPI + 准时交货',
    query: '评估供应商 SUP-001 的绩效 KPI 和准时交货质量',
    path: 'DAG',
    editable: true,
  },
  {
    id: 'sup-2',
    category: 'supplier',
    title: '供应商绩效表现',
    query: '评估供应商 SUP-002 中兴通讯的绩效表现',
    path: 'DAG',
    editable: true,
  },
  {
    id: 'sup-3',
    category: 'supplier',
    title: '计算供应商 KPI',
    query: '计算供应商 SUP-003 比亚迪电子的 KPI',
    path: 'DAG',
    editable: true,
  },
  {
    id: 'sup-4',
    category: 'supplier',
    title: '供应商绩效评分',
    query: '分析供应商 SUP-002 的绩效评分',
    path: 'DAG',
    editable: true,
  },
  {
    id: 'sup-5',
    category: 'supplier',
    title: '哪些供应商总是送货迟到',
    query: '哪些供应商送货总是迟到',
    path: 'DAG',
  },
  {
    id: 'sup-6',
    category: 'supplier',
    title: '评估指定供应商交货质量',
    query: '评估供应商 SUP-999 的绩效和交货质量',
    path: 'DAG',
    editable: true,
  },

  // ========== 采购支出分析 ==========
  {
    id: 'spend-1',
    category: 'spending',
    title: '采购支出品类分布',
    query: '分析最近的采购支出分布，按品类统计花费情况',
    path: 'DAG',
  },
  {
    id: 'spend-2',
    category: 'spending',
    title: '供应商采购支出占比',
    query: '各供应商的采购支出占比分析',
    path: 'DAG',
  },
  {
    id: 'spend-3',
    category: 'spending',
    title: '钱都花在哪些品类',
    query: '钱都花在哪些品类上了',
    path: 'DAG',
  },
  {
    id: 'spend-4',
    category: 'spending',
    title: '采购额度供应商排名',
    query: '采购额度按供应商排名',
    path: 'DAG',
  },
  {
    id: 'spend-5',
    category: 'spending',
    title: '月度采购支出统计',
    query: '月度采购支出统计',
    path: 'DAG',
  },

  // ========== 收货异常分析 ==========
  {
    id: 'rcv-1',
    category: 'receipt',
    title: '超量收货与拒收排查',
    query: '分析最近有没有超量收货或拒收的情况',
    path: 'DAG',
  },
  {
    id: 'rcv-2',
    category: 'receipt',
    title: '指定供应商收货延迟与退货',
    query: '检查 SUP-001 的收货延迟和退货记录',
    path: 'DAG',
    editable: true,
  },
  {
    id: 'rcv-3',
    category: 'receipt',
    title: '哪些订单超量收货',
    query: '哪些订单超量收货了',
    path: 'DAG',
  },
  {
    id: 'rcv-4',
    category: 'receipt',
    title: '入库与订单数量不一致',
    query: '入库数量和订单数量对不上',
    path: 'DAG',
  },
  {
    id: 'rcv-5',
    category: 'receipt',
    title: '验收不合格记录',
    query: '最近有没有验收不合格的记录',
    path: 'DAG',
  },

  // ========== 发票重复检测 ==========
  {
    id: 'invdup-1',
    category: 'invoice_dup',
    title: '重复发票与重复付款',
    query: '检查有没有重复发票或重复付款的情况',
    path: 'DAG',
  },
  {
    id: 'invdup-2',
    category: 'invoice_dup',
    title: '同供应商重复开票',
    query: '同一供应商重复开票检查',
    path: 'DAG',
  },
  {
    id: 'invdup-3',
    category: 'invoice_dup',
    title: '有没有多付的发票',
    query: '有没有多付的发票',
    path: 'DAG',
  },
  {
    id: 'invdup-4',
    category: 'invoice_dup',
    title: '疑似重复发票排查',
    query: '疑似重复的发票排查',
    path: 'DAG',
  },

  // ========== 折扣利用率分析 ==========
  {
    id: 'disc-1',
    category: 'discount',
    title: '早付折扣利用情况',
    query: '分析早付折扣的利用情况，错过了多少折扣机会',
    path: 'DAG',
  },
  {
    id: 'disc-2',
    category: 'discount',
    title: '折扣期未付款损失',
    query: '折扣期内没付款损失了多少钱',
    path: 'DAG',
  },
  {
    id: 'disc-3',
    category: 'discount',
    title: '现金折扣利用率',
    query: '现金折扣的利用率是多少',
    path: 'DAG',
  },
  {
    id: 'disc-4',
    category: 'discount',
    title: '哪些发票错过折扣',
    query: '哪些发票错过了折扣',
    path: 'DAG',
  },

  // ========== PO 周期分析 ==========
  {
    id: 'cycle-1',
    category: 'po_cycle',
    title: '采购全流程周期耗时',
    query: '分析采购订单从下单到收货到付款的周期耗时',
    path: 'DAG',
  },
  {
    id: 'cycle-2',
    category: 'po_cycle',
    title: '处理最慢的订单',
    query: '哪些订单处理最慢',
    path: 'DAG',
  },
  {
    id: 'cycle-3',
    category: 'po_cycle',
    title: '采购到付款时长',
    query: '从采购到付款要多长时间',
    path: 'DAG',
  },
  {
    id: 'cycle-4',
    category: 'po_cycle',
    title: '采购效率分析',
    query: '采购效率分析',
    path: 'DAG',
  },

  // ========== 供应商集中度分析 ==========
  {
    id: 'conc-1',
    category: 'concentration',
    title: '供应商集中度与依赖风险',
    query: '分析供应商集中度和采购依赖风险，有没有单一来源',
    path: 'DAG',
  },
  {
    id: 'conc-2',
    category: 'concentration',
    title: '单一来源品类',
    query: '哪些品类只有一家供应商',
    path: 'DAG',
  },
  {
    id: 'conc-3',
    category: 'concentration',
    title: '采购依赖最多的供应商',
    query: '采购依赖哪些供应商最多',
    path: 'DAG',
  },
  {
    id: 'conc-4',
    category: 'concentration',
    title: '供应商采购占比分析',
    query: '供应商采购占比分析',
    path: 'DAG',
  },

  // ========== 综合 / 探索性分析 ==========
  {
    id: 'mix-1',
    category: 'mixed',
    title: '采购数据全面分析',
    query: '帮我全面分析一下最近的采购数据，包括三路匹配、价格差异、付款合规和供应商绩效',
    path: 'ReAct',
  },
  {
    id: 'mix-2',
    category: 'mixed',
    title: '最近有什么异常',
    query: '最近采购有什么异常吗？',
    path: 'DAG',
  },
  {
    id: 'mix-3',
    category: 'mixed',
    title: '给我看看采购数据',
    query: '给我看看采购数据',
    path: 'Lookup/ReAct',
  },
  {
    id: 'mix-4',
    category: 'mixed',
    title: '采购员谈判能力评估',
    query: '哪些采购员的价格谈判能力比较弱',
    path: 'ReAct',
  },
  {
    id: 'mix-5',
    category: 'mixed',
    title: '质量投诉与付款节奏关联',
    query: 'SUP-001 质量投诉变多了，是否也影响了付款节奏',
    path: 'ReAct',
    editable: true,
  },
  {
    id: 'mix-6',
    category: 'mixed',
    title: '销售部门业绩趋势',
    query: '分析一下销售部门的业绩趋势',
    path: '早退',
  },

  // ========== 会话上下文 ==========
  {
    id: 'ctx-1',
    category: 'context',
    title: '上次最严重的异常',
    query: '上次分析中最严重的异常是哪个',
    path: 'ReAct',
    aliases: ['上一次最严重的异常'],
  },
  {
    id: 'ctx-2',
    category: 'context',
    title: '上次分析结果',
    query: '上次分析的结果呢',
    path: 'ReAct',
    aliases: ['上一次分析结果'],
  },
];
