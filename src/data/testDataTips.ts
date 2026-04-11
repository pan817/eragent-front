// 测试数据说明 —— 用于 TestDataTipsButton 展示的静态内容
// 数据来源：modules/p2p/mock_data/generator.py（seed=42）

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
  { label: '数量', value: '默认 50 笔' },
  { label: '编号范围', value: 'PO-2024-0001 ~ PO-2024-0050' },
  { label: '创建日期', value: '2024-03-01 ~ 2024-04-29' },
  { label: '币种', value: 'CNY' },
  { label: '状态', value: 'APPROVED' },
  { label: '订单数量范围', value: '100 ~ 5,000 件' },
];

export const PO_ANOMALIES: AnomalyNote[] = [
  {
    label: '价格差异异常',
    detail: '约 5% 的订单行实际单价比标准价高 6%~15%',
  },
];

export const RECEIPT_FACTS: { label: string; value: string }[] = [
  { label: '编号范围', value: 'RCV-2024-0001 ~ RCV-2024-0050' },
  { label: '与 PO 关系', value: '一一对应' },
  { label: '收货日期', value: '2024-04-05 ~ 2024-05-19' },
];

export const RECEIPT_ANOMALIES: AnomalyNote[] = [
  { label: '异常率', detail: '约 8%' },
  { label: '短缺', detail: '收货数量为订单数量的 80%~94%' },
  { label: '拒收', detail: '含 2%~5% 的拒收数量' },
];

export const INVOICE_FACTS: { label: string; value: string }[] = [
  { label: '编号范围', value: 'INV-2024-0001 ~ INV-2024-0050' },
  { label: '发票日期', value: '2024-04-10 ~ 2024-05-24' },
  { label: '到期日', value: '发票日期 + 30 天' },
  { label: '折扣截止日', value: '发票日期 + 10 天' },
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
  { label: '编号范围', value: 'PAY-2024-0001 ~ PAY-2024-0050' },
  { label: '与发票关系', value: '一一对应' },
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

export const QUERY_SCENARIOS: ScenarioRow[] = [
  {
    scenario: '三路匹配',
    examples: [
      '分析最近的三路匹配异常',
      '检查 PO-2024-0001 的匹配情况',
    ],
  },
  {
    scenario: '价格差异',
    examples: [
      '分析采购价格差异',
      '哪些订单的价格超出标准价',
    ],
  },
  {
    scenario: '付款合规',
    examples: [
      '检查付款合规性',
      '有哪些逾期付款',
    ],
  },
  {
    scenario: '供应商绩效',
    examples: [
      '评估供应商绩效',
      'SUP-001 的交货表现如何',
    ],
  },
];

export const ID_CHIPS: IdChipGroup[] = [
  { label: '供应商', range: 'SUP-001 ~ SUP-005' },
  { label: '采购订单', range: 'PO-2024-0001 ~ PO-2024-0050' },
  { label: '收货单', range: 'RCV-2024-0001 ~ RCV-2024-0050' },
  { label: '发票', range: 'INV-2024-0001 ~ INV-2024-0050' },
  { label: '付款单', range: 'PAY-2024-0001 ~ PAY-2024-0050' },
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
  { key: 'queries', icon: '💡', label: '查询建议' },
];
