export interface Suggestion {
  icon: string;
  title: string;
  description: string;
  query: string;
}

/** 欢迎页快捷建议卡片 */
export const SUGGESTIONS: Suggestion[] = [
  {
    icon: '🔍',
    title: '三路匹配异常',
    description: '检测 PO、收货、发票之间的数量与金额偏差',
    query: '分析最近的三路匹配异常情况，看看哪些订单存在数量或金额偏差',
  },
  {
    icon: '💰',
    title: '价格差异分析',
    description: '对比实际采购价格与合同价，找出偏差较大的订单',
    query: '分析所有供应商的采购价格差异，找出实际价格与合同价偏差较大的订单',
  },
  {
    icon: '📦',
    title: '采购订单异常',
    description: '查看近期采购订单中的高风险异常',
    query: '查看最近30天的采购订单异常，按严重等级排序',
  },
  {
    icon: '📊',
    title: '供应商绩效',
    description: '评估供应商 KPI 指标，识别表现不佳的供应商',
    query: '评估所有供应商最近30天的绩效 KPI，找出表现不佳的供应商',
  },
];
