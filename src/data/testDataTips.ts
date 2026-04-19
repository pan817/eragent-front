// 测试数据说明 —— 用于 TestDataTipsButton 展示的静态内容
// 数据来源：modules/p2p/mock_data/generator.py（seed=42）
// 所有日期不超过当前日期（生成时自动截断）

export interface SupplierRow {
  id: string;
  name: string;
  site: string;
}

export interface MaterialRow {
  id: string;
  name: string;
  category: string;
  price: string;
}

export interface AnomalyNote {
  label: string;
  detail: string;
}

export interface ScenarioRow {
  scenario: string;
  examples: string[];
}

export type RoutePath = 'DAG' | 'ReAct' | '早退' | 'Lookup' | 'Lookup/ReAct';

export interface TestCaseRow {
  id: number;
  query: string;
  route: string;
  path: RoutePath;
  note: string;
}

export interface TestCaseGroup {
  title: string;
  cases: TestCaseRow[];
}

/** 边界 / 异常输入用例（预期返回错误码） */
export interface BoundaryCaseRow {
  id: number;
  query: string;
  params?: string;
  expected: string;
  note: string;
}

export interface IdChipGroup {
  label: string;
  range: string;
}

export const SUPPLIERS: SupplierRow[] = [
  { id: 'SUP-001', name: '华为科技', site: 'SITE-001' },
  { id: 'SUP-002', name: '中兴通讯', site: 'SITE-002' },
  { id: 'SUP-003', name: '比亚迪电子', site: 'SITE-003' },
  { id: 'SUP-004', name: '联想集团', site: 'SITE-004' },
  { id: 'SUP-005', name: '海尔智家', site: 'SITE-005' },
];

export const PAYMENT_TERMS = ['NET30', 'NET45', 'NET60', '2/10NET30'];

export const MATERIALS: MaterialRow[] = [
  { id: 'MAT-001', name: '钢板', category: 'RAW_MATERIAL', price: '150.00' },
  { id: 'MAT-002', name: '铜线', category: 'RAW_MATERIAL', price: '85.00' },
  { id: 'CMP-001', name: '电路板', category: 'COMPONENT', price: '320.00' },
  { id: 'CMP-002', name: '电容器', category: 'COMPONENT', price: '12.50' },
  { id: 'PKG-001', name: '包装箱', category: 'PACKAGING', price: '8.00' },
];

export const PO_FACTS: { label: string; value: string }[] = [
  { label: '数量', value: '默认 500 笔' },
  { label: '编号范围', value: 'PO-2024-0001 ~ PO-2024-0500' },
  { label: '币种', value: 'CNY' },
  { label: '状态', value: 'APPROVED' },
  { label: '订单数量范围', value: '100 ~ 5,000 件' },
  { label: 'PO 创建日期范围', value: '2024-01-13 ~ 2026-02-11' },
];

export const PO_DATE_DISTRIBUTION: { label: string; value: string }[] = [
  { label: '2026-01-01 ~ 2026-02-11（~60%）', value: '约 299 笔（近期数据）' },
  { label: '2025-01-01 ~ 2025-12-31（~25%）', value: '约 126 笔（历史数据）' },
  { label: '2024-01-01 ~ 2024-12-31（~15%）', value: '约 75 笔（早期数据）' },
];

export const PO_TIME_RANGE_HITS: { label: string; value: string }[] = [
  { label: '7d（最近 7 天）', value: '少量收货/发票/付款（PO 创建不在此窗口）' },
  { label: '30d（最近 30 天）', value: '部分收货/发票/付款（PO 创建至少在 60 天前）' },
  { label: '90d（最近 90 天）', value: '约 221 笔 PO（44%），推荐使用' },
  { label: '365d（最近一年）', value: '约 425 笔 PO（85%）' },
  { label: '不传（默认 30d）', value: '同 30d' },
];

export const PO_ANOMALIES: AnomalyNote[] = [
  {
    label: '价格差异异常',
    detail: '约 5% 的订单行实际单价比标准价高 6%~15%',
  },
];

export const PO_DATE_NOTE = 'PO 创建日期不会出现在最近 60 天内（预留给收货/发票/付款的日期偏移）';

export const RECEIPT_FACTS: { label: string; value: string }[] = [
  { label: '编号范围', value: 'RCV-2024-0001 ~ RCV-2024-0500' },
  { label: '与 PO 关系', value: '一一对应' },
  { label: '收货日期', value: 'PO 创建日期 + 25~50 天（不超过今天）' },
  { label: '日期范围', value: '2024-02-16 ~ 2026-04-01' },
  { label: '承诺交期', value: 'PO 创建日期 + 20~45 天（不超过今天）' },
];

export const RECEIPT_ANOMALIES: AnomalyNote[] = [
  { label: '异常率', detail: '约 8%' },
  { label: '短缺', detail: '收货数量为订单数量的 80%~94%' },
  { label: '拒收', detail: '含 2%~5% 的拒收数量' },
];

export const INVOICE_FACTS: { label: string; value: string }[] = [
  { label: '编号范围', value: 'INV-2024-0001 ~ INV-2024-0500' },
  { label: '发票日期', value: 'PO 创建日期 + 30~55 天（不超过今天）' },
  { label: '日期范围', value: '2024-02-16 ~ 2026-04-06' },
  { label: '到期日', value: '发票日期 + 30 天（不超过今天）' },
  { label: '折扣截止日', value: '发票日期 + 10 天（不超过今天）' },
  { label: '状态', value: 'VALIDATED' },
  { label: '付款条款', value: 'NET30' },
];

export const INVOICE_ANOMALIES: AnomalyNote[] = [
  {
    label: '三路匹配不一致',
    detail: '约 8% 的发票金额比 PO 金额高 6%~15%',
  },
];

export const PAYMENT_FACTS: { label: string; value: string }[] = [
  { label: '编号范围', value: 'PAY-2024-0001 ~ PAY-2024-0500' },
  { label: '与发票关系', value: '一一对应' },
  { label: '付款日期', value: '基于发票到期日偏移（不超过今天）' },
  { label: '日期范围', value: '2024-03-15 ~ 2026-04-12' },
  { label: '付款方式', value: 'BANK_TRANSFER / CHECK（随机分配）' },
  { label: '正常付款时点', value: '到期日前 1~5 天支付' },
];

export const PAYMENT_ANOMALIES: AnomalyNote[] = [
  {
    label: '逾期付款（~5%）',
    detail: '超过到期日 5~60 天',
  },
  {
    label: '提前付款过早（~5%）',
    detail: '早于到期日 15~30 天',
  },
  {
    label: '折扣滥用（~3%）',
    detail: '超过折扣截止日仍按 2% 折扣付款',
  },
];

export const QUERY_SCENARIOS: ScenarioRow[] = [];

export const TEST_CASE_GROUPS: TestCaseGroup[] = [
  {
    title: '一、三路匹配',
    cases: [
      { id: 1, query: '分析三路匹配发票收货异常', route: 'L1', path: 'DAG', note: '命中关键词"三路匹配""发票""收货"' },
      { id: 2, query: '请分析最近的三路匹配异常情况，看看哪些订单存在数量或金额偏差', route: 'L1', path: 'DAG', note: '命中"三路匹配""异常""订单"' },
      { id: 3, query: '检查采购订单 PO-2024-0035 的三路匹配情况', route: 'L1', path: 'DAG', note: '命中"三路匹配"；提取 po_number=PO-2024-0035' },
      { id: 4, query: '检查一下开票数量和入库数量对不上的情况', route: 'L2', path: 'DAG', note: '无"三路匹配"关键词，语义匹配种子' },
      { id: 5, query: '分析三路匹配发票异常', route: 'L1', path: 'DAG', note: '命中"三路匹配""发票"' },
    ],
  },
  {
    title: '二、价格差异',
    cases: [
      { id: 6, query: '检查价格差异和合同价偏差', route: 'L1', path: 'DAG', note: '命中"价格差异""合同价"' },
      { id: 7, query: '分析所有供应商的采购价格差异，找出实际价格与合同价偏差较大的订单', route: 'L1', path: 'DAG', note: '命中"价格""供应商""订单"' },
      { id: 8, query: '分析供应商 SUP-001 华为科技的价格差异情况', route: 'L1', path: 'DAG', note: '命中"价格差异""供应商"；提取 supplier_id=SUP-001' },
      { id: 9, query: '分析价格差异', route: 'L1', path: 'DAG', note: '命中"价格差异"' },
      { id: 10, query: '为什么最近采购成本比预算高出那么多', route: 'L2', path: 'DAG', note: '无"价格差异"关键词，语义匹配种子' },
      { id: 11, query: '分析 SUP-001 最近60天的价格差异', route: 'L1', path: 'DAG', note: '命中"价格差异"；提取 supplier_id=SUP-001, days=60' },
    ],
  },
  {
    title: '三、付款合规',
    cases: [
      { id: 12, query: '分析付款逾期和折扣滥用情况', route: 'L1', path: 'DAG', note: '命中"付款""逾期"' },
      { id: 13, query: '检查付款合规性，是否存在逾期付款或提前付款的情况', route: 'L1', path: 'DAG', note: '命中"付款""逾期""提前付款"' },
      { id: 14, query: '检查最近90天的付款合规情况', route: 'L1', path: 'DAG', note: '命中"付款"；提取 days=90' },
      { id: 15, query: '有没有该付钱还没付的账单', route: 'L2', path: 'DAG', note: '无强关键词，语义匹配种子' },
      { id: 16, query: '分析最近60天的付款逾期', route: 'L1', path: 'DAG', note: '命中"付款""逾期"；提取 days=60' },
    ],
  },
  {
    title: '四、供应商绩效',
    cases: [
      { id: 17, query: '评估供应商 SUP-001 的绩效 KPI 和准时交货质量', route: 'L1', path: 'DAG', note: '命中"供应商""绩效""KPI"；提取 supplier_id=SUP-001' },
      { id: 18, query: '评估供应商 SUP-002 中兴通讯的绩效表现', route: 'L1', path: 'DAG', note: '命中"供应商""绩效"；提取 supplier_id=SUP-002' },
      { id: 19, query: '计算供应商 SUP-003 比亚迪电子的 KPI', route: 'L1', path: 'DAG', note: '命中"供应商""KPI"；提取 supplier_id=SUP-003' },
      { id: 20, query: '分析供应商 SUP-002 的绩效评分', route: 'L1', path: 'DAG', note: '命中"供应商""绩效""评分"；提取 supplier_id=SUP-002' },
      { id: 21, query: '哪些供应商送货总是迟到', route: 'L2', path: 'DAG', note: '无强关键词，语义匹配种子' },
      { id: 22, query: '评估供应商 SUP-999 的绩效和交货质量', route: 'L1', path: 'DAG', note: '提取 supplier_id=SUP-999（不存在，DAG 执行但数据为空）' },
    ],
  },
  {
    title: '五、采购支出分析',
    cases: [
      { id: 23, query: '分析最近的采购支出分布，按品类统计花费情况', route: 'L1', path: 'DAG', note: '命中"支出""品类""花费"' },
      { id: 24, query: '各供应商的采购支出占比分析', route: 'L1', path: 'DAG', note: '命中"支出""占比""供应商"' },
      { id: 25, query: '钱都花在哪些品类上了', route: 'L2', path: 'DAG', note: '无强关键词，语义匹配种子' },
      { id: 26, query: '采购额度按供应商排名', route: 'L2', path: 'DAG', note: '语义匹配种子' },
      { id: 27, query: '月度采购支出统计', route: 'L2', path: 'DAG', note: '语义匹配种子' },
    ],
  },
  {
    title: '六、收货异常分析',
    cases: [
      { id: 28, query: '分析最近有没有超量收货或拒收的情况', route: 'L1', path: 'DAG', note: '命中"超量""拒收"' },
      { id: 29, query: '检查 SUP-001 的收货延迟和退货记录', route: 'L1', path: 'DAG', note: '命中"退货""收货"；提取 supplier_id=SUP-001' },
      { id: 30, query: '哪些订单超量收货了', route: 'L1', path: 'DAG', note: '命中"超量""收货"' },
      { id: 31, query: '入库数量和订单数量对不上', route: 'L2', path: 'DAG', note: '语义匹配种子' },
      { id: 32, query: '最近有没有验收不合格的记录', route: 'L1', path: 'DAG', note: '命中"验收不合格"' },
    ],
  },
  {
    title: '七、发票重复检测',
    cases: [
      { id: 33, query: '检查有没有重复发票或重复付款的情况', route: 'L1', path: 'DAG', note: '命中"重复发票""重复付款"' },
      { id: 34, query: '同一供应商重复开票检查', route: 'L1', path: 'DAG', note: '命中"重复开票"' },
      { id: 35, query: '有没有多付的发票', route: 'L2', path: 'DAG', note: '语义匹配种子' },
      { id: 36, query: '疑似重复的发票排查', route: 'L1', path: 'DAG', note: '命中"重复""发票"' },
    ],
  },
  {
    title: '八、折扣利用率分析',
    cases: [
      { id: 37, query: '分析早付折扣的利用情况，错过了多少折扣机会', route: 'L1', path: 'DAG', note: '命中"折扣""早付"' },
      { id: 38, query: '折扣期内没付款损失了多少钱', route: 'L2', path: 'DAG', note: '语义匹配种子' },
      { id: 39, query: '现金折扣的利用率是多少', route: 'L1', path: 'DAG', note: '命中"折扣""现金折扣"' },
      { id: 40, query: '哪些发票错过了折扣', route: 'L2', path: 'DAG', note: '语义匹配种子' },
    ],
  },
  {
    title: '九、PO 周期分析',
    cases: [
      { id: 41, query: '分析采购订单从下单到收货到付款的周期耗时', route: 'L1', path: 'DAG', note: '命中"周期""耗时""从下单到"' },
      { id: 42, query: '哪些订单处理最慢', route: 'L2', path: 'DAG', note: '语义匹配种子' },
      { id: 43, query: '从采购到付款要多长时间', route: 'L2', path: 'DAG', note: '语义匹配种子' },
      { id: 44, query: '采购效率分析', route: 'L1', path: 'DAG', note: '命中"效率"' },
    ],
  },
  {
    title: '十、供应商集中度分析',
    cases: [
      { id: 45, query: '分析供应商集中度和采购依赖风险，有没有单一来源', route: 'L1', path: 'DAG', note: '命中"集中度""依赖""单一来源"' },
      { id: 46, query: '哪些品类只有一家供应商', route: 'L2', path: 'DAG', note: '语义匹配种子' },
      { id: 47, query: '采购依赖哪些供应商最多', route: 'L1', path: 'DAG', note: '命中"依赖""供应商"' },
      { id: 48, query: '供应商采购占比分析', route: 'L1', path: 'DAG', note: '命中"占比""供应商"' },
    ],
  },
];

export const TEST_CASE_EXTRA_GROUPS: TestCaseGroup[] = [
  {
    title: '十一、综合 / 探索性分析',
    cases: [
      { id: 49, query: '帮我全面分析一下最近的采购数据，包括三路匹配、价格差异、付款合规和供应商绩效', route: 'L1', path: 'ReAct', note: '命中 COMPREHENSIVE（多类型并列）；无具体实体' },
      { id: 50, query: '最近采购有什么异常吗？', route: 'L2', path: 'DAG', note: '匹配概览触发词 → 通用 DAG 模板' },
      { id: 51, query: '给我看看采购数据', route: 'bypass', path: 'Lookup/ReAct', note: '命中 DATA_LOOKUP；未命中则降级 ReAct' },
      { id: 52, query: '哪些采购员的价格谈判能力比较弱', route: 'L3', path: 'ReAct', note: 'L1/L2 未命中，LLM 分类后走 ReAct' },
      { id: 53, query: 'SUP-001 质量投诉变多了，是否也影响了付款节奏', route: 'L3', path: 'ReAct', note: '跨类型联动，L3 兜底 ReAct' },
      { id: 54, query: '分析一下销售部门的业绩趋势', route: 'bypass', path: '早退', note: 'OUT_OF_SCOPE（非 P2P 领域），模板直答' },
    ],
  },
  {
    title: '十二、会话上下文',
    cases: [
      { id: 55, query: '上次分析中最严重的异常是哪个', route: 'bypass', path: 'ReAct', note: 'RECALL（命中"上次"），走 ReAct 读取短期记忆' },
      { id: 56, query: '上次分析的结果呢', route: 'bypass', path: 'ReAct', note: 'RECALL（命中"上次""结果呢"），走 ReAct 读取短期记忆' },
    ],
  },
  {
    title: '十三、路由覆盖与参数提取',
    cases: [
      { id: 57, query: '分析价格差异情况', route: '显式覆盖', path: 'DAG', note: 'query 命中 price_variance，但显式 analysis_type=three_way_match 优先' },
      { id: 58, query: '分析三路匹配发票收货异常', route: '显式覆盖', path: 'ReAct', note: 'L1 命中，但显式 COMPREHENSIVE → 走 ReAct' },
      { id: 59, query: '分析最近60天供应商 SUP-005 海尔智家的三路匹配情况', route: 'L1', path: 'DAG', note: '命中"三路匹配"；提取 supplier_id=SUP-005, days=60' },
      { id: 60, query: '检查 PO-2024-0035 的三路匹配情况', route: 'L1', path: 'DAG', note: '命中"三路匹配"；提取 po_number=PO-2024-0035' },
      { id: 61, query: '分析最近60天的付款逾期', route: 'L1', path: 'DAG', note: 'request 级 time_range_days=90 覆盖 query 中的 60' },
      { id: 62, query: '分析三路匹配发票收货异常', route: 'L1', path: 'DAG', note: '极短 time_range_days=1，DAG 执行但可能无数据' },
    ],
  },
];

export const BOUNDARY_CASES: BoundaryCaseRow[] = [
  { id: 63, query: '（空）', expected: '422', note: '空查询校验' },
  { id: 64, query: '分析数据', params: 'analysis_type=invalid_type', expected: '422', note: '非法 analysis_type 校验' },
  { id: 65, query: '分析三路匹配', params: 'time_range_days=0', expected: '422', note: '时间范围下界校验' },
  { id: 66, query: '分析三路匹配', params: 'time_range_days=999', expected: '422', note: '时间范围上界校验' },
  { id: 67, query: '（超长 query，200+ 字）', expected: 'L1/DAG', note: '超长文本仍应正常路由' },
];

export const ID_CHIPS: IdChipGroup[] = [
  { label: '供应商', range: 'SUP-001 ~ SUP-005' },
  { label: '采购订单', range: 'PO-2024-0001 ~ PO-2024-0500' },
  { label: '收货单', range: 'RCV-2024-0001 ~ RCV-2024-0500' },
  { label: '发票', range: 'INV-2024-0001 ~ INV-2024-0500' },
  { label: '付款单', range: 'PAY-2024-0001 ~ PAY-2024-0500' },
  { label: '物料', range: 'MAT-001、MAT-002、CMP-001、CMP-002、PKG-001' },
];

export type TipsTabKey =
  | 'overview'
  | 'suppliers'
  | 'orders'
  | 'receipts'
  | 'invoices'
  | 'payments'
  | 'queries';

export const TIPS_TABS: { key: TipsTabKey; icon: string; label: string }[] = [
  { key: 'overview', icon: '🧭', label: '速览' },
  { key: 'suppliers', icon: '🏢', label: '供应商' },
  { key: 'orders', icon: '📦', label: '订单 & 物料' },
  { key: 'receipts', icon: '🚚', label: '收货' },
  { key: 'invoices', icon: '🧾', label: '发票' },
  { key: 'payments', icon: '💳', label: '付款' },
  { key: 'queries', icon: '🧪', label: '测试用例' },
];
