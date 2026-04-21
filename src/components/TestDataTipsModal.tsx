import { useEffect, useState } from 'react';
import {
  SUPPLIERS,
  PAYMENT_TERMS,
  MATERIALS,
  PO_FACTS,
  PO_DATE_DISTRIBUTION,
  PO_TIME_RANGE_HITS,
  PO_ANOMALIES,
  PO_DATE_NOTE,
  RECEIPT_FACTS,
  RECEIPT_ANOMALIES,
  INVOICE_FACTS,
  INVOICE_ANOMALIES,
  PAYMENT_FACTS,
  PAYMENT_ANOMALIES,
  TEST_CASE_GROUPS,
  TEST_CASE_EXTRA_GROUPS,
  BOUNDARY_CASES,
  ID_CHIPS,
  TIPS_TABS,
  type TipsTabKey,
  type AnomalyNote,
  type RoutePath,
} from '../data/testDataTips';
import './TestDataTips.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

function FactGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="tips-kv-grid">
      {items.map(it => (
        <div key={it.label} className="tips-kv-card">
          <div className="tips-kv-label">{it.label}</div>
          <div className="tips-kv-value">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function AnomalyList({ items }: { items: AnomalyNote[] }) {
  return (
    <div className="tips-anomaly-list">
      {items.map(it => (
        <div key={it.label} className="tips-anomaly-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <strong>{it.label}</strong>
            {it.detail && <>：{it.detail}</>}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ emoji, title, count }: { emoji: string; title: string; count?: string }) {
  return (
    <h3 className="tips-section-title">
      <span>{emoji}</span>
      <span>{title}</span>
      {count && <span className="tips-section-title-badge">{count}</span>}
    </h3>
  );
}

function OverviewPanel() {
  return (
    <>
      <div className="tips-section">
        <SectionTitle emoji="🧭" title="数据速览" />
        <p className="tips-section-desc">
          系统内置 5 家供应商、500 笔采购订单及其配套的收货单、发票、付款单，含若干预置异常场景供测试。所有日期不超过当前日期。
        </p>
        <div className="tips-kv-grid">
          <div className="tips-kv-card">
            <div className="tips-kv-label">供应商</div>
            <div className="tips-kv-value">5 家 · 全部 ACTIVE</div>
          </div>
          <div className="tips-kv-card">
            <div className="tips-kv-label">采购订单</div>
            <div className="tips-kv-value">500 笔 · APPROVED</div>
          </div>
          <div className="tips-kv-card">
            <div className="tips-kv-label">收货 / 发票 / 付款</div>
            <div className="tips-kv-value">各 500 条，一一对应</div>
          </div>
          <div className="tips-kv-card">
            <div className="tips-kv-label">随机种子</div>
            <div className="tips-kv-value">seed = 42（可复现）</div>
          </div>
        </div>
      </div>

      <div className="tips-section">
        <SectionTitle emoji="🔑" title="关键编号速查" />
        <div className="tips-id-chips">
          {ID_CHIPS.map(g => (
            <span key={g.label} className="tips-id-chip">
              {g.label} <code>{g.range}</code>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

function SuppliersPanel() {
  return (
    <>
      <div className="tips-section">
        <SectionTitle emoji="🏢" title="供应商列表" count={`${SUPPLIERS.length} 家`} />
        <p className="tips-section-desc">
          状态均为 <code className="tips-code">ACTIVE</code>，付款条款在下列枚举中随机分配。
        </p>
        <div className="tips-table-wrap">
          <table className="tips-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>名称</th>
                <th>站点编号</th>
              </tr>
            </thead>
            <tbody>
              {SUPPLIERS.map(s => (
                <tr key={s.id}>
                  <td><code>{s.id}</code></td>
                  <td>{s.name}</td>
                  <td><code>{s.site}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tips-section">
        <SectionTitle emoji="💼" title="付款条款（随机）" />
        <div className="tips-id-chips">
          {PAYMENT_TERMS.map(t => (
            <span key={t} className="tips-id-chip"><code>{t}</code></span>
          ))}
        </div>
      </div>
    </>
  );
}

function OrdersPanel() {
  return (
    <>
      <div className="tips-section">
        <SectionTitle emoji="📦" title="采购订单基本信息" />
        <FactGrid items={PO_FACTS} />
      </div>

      <div className="tips-section">
        <SectionTitle emoji="📅" title="创建日期分布" />
        <FactGrid items={PO_DATE_DISTRIBUTION} />
      </div>

      <div className="tips-section">
        <SectionTitle emoji="⏱️" title="时间范围查询可命中" />
        <FactGrid items={PO_TIME_RANGE_HITS} />
        <div className="tips-anomaly-item" style={{ marginTop: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div>{PO_DATE_NOTE}</div>
        </div>
      </div>

      <div className="tips-section">
        <SectionTitle emoji="🧱" title="物料清单" count={`${MATERIALS.length} 种`} />
        <div className="tips-table-wrap">
          <table className="tips-table">
            <thead>
              <tr>
                <th>物料编号</th>
                <th>名称</th>
                <th>类别</th>
                <th>标准单价 (CNY)</th>
              </tr>
            </thead>
            <tbody>
              {MATERIALS.map(m => (
                <tr key={m.id}>
                  <td><code>{m.id}</code></td>
                  <td>{m.name}</td>
                  <td><code>{m.category}</code></td>
                  <td>¥ {m.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tips-section">
        <SectionTitle emoji="⚠️" title="预置异常" />
        <AnomalyList items={PO_ANOMALIES} />
      </div>
    </>
  );
}

function ReceiptsPanel() {
  return (
    <>
      <div className="tips-section">
        <SectionTitle emoji="🚚" title="收货记录" />
        <FactGrid items={RECEIPT_FACTS} />
      </div>
      <div className="tips-section">
        <SectionTitle emoji="⚠️" title="预置异常（约 8%）" />
        <AnomalyList items={RECEIPT_ANOMALIES} />
      </div>
    </>
  );
}

function InvoicesPanel() {
  return (
    <>
      <div className="tips-section">
        <SectionTitle emoji="🧾" title="发票" />
        <FactGrid items={INVOICE_FACTS} />
      </div>
      <div className="tips-section">
        <SectionTitle emoji="⚠️" title="预置异常" />
        <AnomalyList items={INVOICE_ANOMALIES} />
      </div>
    </>
  );
}

function PaymentsPanel() {
  return (
    <>
      <div className="tips-section">
        <SectionTitle emoji="💳" title="付款记录" />
        <FactGrid items={PAYMENT_FACTS} />
      </div>
      <div className="tips-section">
        <SectionTitle emoji="⚠️" title="预置异常(约 10%)" />
        <AnomalyList items={PAYMENT_ANOMALIES} />
      </div>
    </>
  );
}

const PATH_STYLE: Record<RoutePath, string> = {
  DAG: 'tips-path-dag',
  ReAct: 'tips-path-react',
  '早退': 'tips-path-early',
  Lookup: 'tips-path-lookup',
  'Lookup/ReAct': 'tips-path-lookup',
  Graph: 'tips-path-graph',
};

function PathBadge({ path }: { path: RoutePath }) {
  return <span className={`tips-path-badge ${PATH_STYLE[path]}`}>{path}</span>;
}

function QueriesPanel() {
  const allGroups = [...TEST_CASE_GROUPS, ...TEST_CASE_EXTRA_GROUPS];
  return (
    <>
      <div className="tips-section">
        <SectionTitle emoji="🧪" title="测试用例集" count={`${allGroups.reduce((s, g) => s + g.cases.length, 0) + BOUNDARY_CASES.length} 条`} />
        <p className="tips-section-desc">
          每条用例标注执行路径：<span className="tips-path-badge tips-path-dag">DAG</span> 并行执行、
          <span className="tips-path-badge tips-path-react">ReAct</span> Agent 自主调用、
          <span className="tips-path-badge tips-path-early">早退</span> 模板直答、
          <span className="tips-path-badge tips-path-lookup">Lookup</span> 快捷路径、
          <span className="tips-path-badge tips-path-graph">Graph</span> 知识图谱。
          路由层级：L1 关键词命中（零延迟）、L2 语义匹配（毫秒级）、L3 LLM 分类（0.5~2s）。
        </p>
      </div>

      {allGroups.map(group => (
        <div key={group.title} className="tips-section">
          <h4 className="tips-group-title">{group.title}</h4>
          <div className="tips-table-wrap">
            <table className="tips-table tips-table-compact">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>查询</th>
                  <th style={{ width: 60 }}>路由</th>
                  <th style={{ width: 90 }}>路径</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {group.cases.map(c => (
                  <tr key={c.id}>
                    <td className="tips-cell-center">{c.id}</td>
                    <td>{c.query}</td>
                    <td className="tips-cell-center"><code>{c.route}</code></td>
                    <td className="tips-cell-center"><PathBadge path={c.path} /></td>
                    <td className="tips-cell-note">{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="tips-section">
        <h4 className="tips-group-title">十四、边界与异常输入</h4>
        <div className="tips-table-wrap">
          <table className="tips-table tips-table-compact">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>查询</th>
                <th>附加参数</th>
                <th style={{ width: 70 }}>预期</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {BOUNDARY_CASES.map(c => (
                <tr key={c.id}>
                  <td className="tips-cell-center">{c.id}</td>
                  <td>{c.query}</td>
                  <td>{c.params ? <code>{c.params}</code> : '—'}</td>
                  <td className="tips-cell-center"><code>{c.expected}</code></td>
                  <td className="tips-cell-note">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tips-section">
        <SectionTitle emoji="🔑" title="可用编号范围" />
        <div className="tips-id-chips">
          {ID_CHIPS.map(g => (
            <span key={g.label} className="tips-id-chip">
              {g.label} <code>{g.range}</code>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

function renderTab(tab: TipsTabKey) {
  switch (tab) {
    case 'overview': return <OverviewPanel />;
    case 'suppliers': return <SuppliersPanel />;
    case 'orders': return <OrdersPanel />;
    case 'receipts': return <ReceiptsPanel />;
    case 'invoices': return <InvoicesPanel />;
    case 'payments': return <PaymentsPanel />;
    case 'queries': return <QueriesPanel />;
  }
}

export default function TestDataTipsModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<TipsTabKey>('overview');

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="tips-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tips-dialog-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="tips-header">
          <div className="tips-header-title">
            <div className="tips-header-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <div>
              <h2 id="tips-dialog-title">测试数据说明</h2>
              <div className="tips-header-sub">
                内置模拟数据的结构、取值范围与可验证的异常场景
              </div>
            </div>
          </div>
          <button
            type="button"
            className="tips-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="tips-tabs" role="tablist">
          {TIPS_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`tips-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`tips-panel-${t.key}`}
              tabIndex={tab === t.key ? 0 : -1}
              className={`tips-tab ${tab === t.key ? 'is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <span className="tips-tab-emoji">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div
          className="tips-body"
          role="tabpanel"
          id={`tips-panel-${tab}`}
          aria-labelledby={`tips-tab-${tab}`}
        >
          <div className="tips-lead">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div>
              数据由 <code className="tips-code">mock_data/generator.py</code> 生成，
              固定随机种子 <code className="tips-code">seed = 42</code>，可复现。
              点击「重置数据」后编号范围保持不变。
            </div>
          </div>
          {renderTab(tab)}
        </div>

        <div className="tips-footer">
          <span className="tips-footer-hint">
            按 <kbd>Esc</kbd> 关闭，也可点击外部区域关闭
          </span>
          <span>共 {TIPS_TABS.length} 个分类</span>
        </div>
      </div>
    </div>
  );
}
