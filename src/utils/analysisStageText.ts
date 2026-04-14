/**
 * 后端 stage / tool / dag_task 事件名到用户友好中文文案的映射。
 *
 * Why: 事件 name 是机器标识（如 intent_resolved / query_purchase_orders），
 * 需要翻成"正在查询采购订单"这类文案才能展示给用户。
 * How: 未命中时返回 null，调用方回落到"正在处理..."兜底文案。
 * 后端新增 stage/tool 时前端可能漏更新，属已知的软降级。
 */

const STAGE_TEXT: Record<string, string> = {
  intent_resolving: '正在理解分析意图',
  intent_resolved: '已识别分析意图',
  dag_building: '正在规划分析步骤',
  dag_built: '分析步骤已规划',
  dag_executing: '正在并行执行分析任务',
  dag_executed: '分析任务执行完成',
  report_generating: '正在生成分析报告',
  report_generated: '分析报告已生成',
};

const TOOL_TEXT: Record<string, string> = {
  query_purchase_orders: '查询采购订单',
  query_invoices: '查询发票',
  query_goods_receipts: '查询收货单',
  query_suppliers: '查询供应商',
  three_way_match: '三路匹配核对',
  price_variance_check: '价格差异分析',
  supplier_kpi: '供应商绩效计算',
};

export function stageText(name: string): string | null {
  return STAGE_TEXT[name] ?? null;
}

export function toolText(name: string): string | null {
  return TOOL_TEXT[name] ?? null;
}

/** 兜底文案：stage/tool 都没命中时在气泡内展示 */
export const FALLBACK_STAGE_TEXT = '正在处理...';
