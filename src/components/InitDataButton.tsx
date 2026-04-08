import { useState } from 'react';
import { initData, type InitDataResponse } from '../services/api';

const TABLE_LABELS: Record<string, string> = {
  ap_payments: '付款记录',
  ap_invoices: '应付发票',
  rcv_transactions: '收货事务',
  po_line_locations: 'PO 行位置',
  po_lines: 'PO 行',
  po_headers: 'PO 头',
  ap_suppliers: '供应商',
};

const CONFIRM_KEYWORD = '重置';

export default function InitDataButton() {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [result, setResult] = useState<InitDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmInput.trim() === CONFIRM_KEYWORD;

  const closeConfirm = () => {
    setConfirming(false);
    setConfirmInput('');
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    closeConfirm();
    setLoading(true);
    setError(null);
    try {
      const res = await initData();
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        className="header-action-btn"
        onClick={() => setConfirming(true)}
        disabled={loading}
        title="清空并重新生成所有模拟数据"
      >
        {loading ? (
          <span className="spinner" />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9c2.5 0 4.8 1 6.5 2.6L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        )}
        <span>{loading ? '生成中...' : '重置数据'}</span>
      </button>

      {confirming && (
        <div className="modal-overlay" onClick={closeConfirm}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon-wrap">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3>确认重置模拟数据？</h3>
            <p>
              此操作将<strong>清空</strong>当前所有模拟数据并重新生成 500 条记录。
              为防止误操作，请在下方输入 <code>{CONFIRM_KEYWORD}</code> 以确认。
            </p>
            <input
              type="text"
              className="confirm-input"
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              placeholder={`输入 "${CONFIRM_KEYWORD}" 确认`}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && canConfirm) handleConfirm();
                if (e.key === 'Escape') closeConfirm();
              }}
            />
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={closeConfirm}>取消</button>
              <button className="btn-danger" onClick={handleConfirm} disabled={!canConfirm}>
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="toast toast-success" role="status">
          <div className="toast-header">
            <span className="toast-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span className="toast-title">成功构造新数据</span>
            <button className="toast-close" onClick={() => setResult(null)} aria-label="关闭">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="toast-message">{result.message}</div>
          <div className="toast-meta">
            随机种子 <code>{result.seed}</code>
          </div>
          <div className="toast-tables">
            {Object.entries(result.tables).map(([key, count]) => (
              <div key={key} className="toast-table-row">
                <span className="toast-table-name">{TABLE_LABELS[key] || key}</span>
                <code className="toast-table-key">{key}</code>
                <span className="toast-table-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="toast toast-error" role="alert">
          <div className="toast-header">
            <span className="toast-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
            <span className="toast-title">操作失败</span>
            <button className="toast-close" onClick={() => setError(null)} aria-label="关闭">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="toast-message">{error}</div>
        </div>
      )}
    </>
  );
}
