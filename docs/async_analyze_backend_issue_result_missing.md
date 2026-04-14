# 异步分析快照接口 `result` 字段缺失 —— 后端 Bug 报告

> 报告时间：2026-04-14
> 报告人：前端
> 影响接口：`GET /api/v1/ptp-agent/analyze/tasks/{trace_id}`
> 后端契约文档：[async_analyze_frontend.md §3.2](./async_analyze_frontend.md#32-get-analyzetasks--trace_id----查询任务快照)
> 严重程度：**高** —— 用户看到"分析失败"，实际任务已成功完成

## 1. 问题概述

任务在后端跑成功（SSE 明确推送 `event: done {status: "ok"}`，`finished_at` / `duration_ms` 都已正确写入）；但紧接着的 `GET /analyze/tasks/{trace_id}` 快照接口返回的 `result` 字段是 `null`，严重违反文档契约。

前端依赖 `result.report_markdown` 渲染报告，字段缺失直接导致气泡显示红色"分析失败"，用户无法拿到分析结果。

## 2. 契约 vs 实际

### 契约（来自 async_analyze_frontend.md §3.2）

```jsonc
{
  "status": "ok",
  "duration_ms": 133000,
  // 仅 status=ok 时有值：
  "result": {
    "report_id": "...",
    "report_markdown": "## 分析报告\n...",
    "anomalies": [ /* ... */ ],
    /* ... 其他字段 ... */
  }
}
```

> 文档明确写 `"仅 status=ok 时有值"` —— 隐含的语义是 **status=ok 必然带 result**。

### 实际返回

```json
{
  "trace_id": "1285b5f0-044c-49a1-a868-e2fdc1804b2e",
  "status": "ok",
  "session_id": "83c139bd-123c-4b8f-9077-e0edfd26b9ff",
  "user_id": "xiegp",
  "created_at": "2026-04-14T19:04:43.492649+08:00",
  "started_at": "2026-04-14T19:04:43.492649+08:00",
  "finished_at": "2026-04-14T19:04:58.653706+08:00",
  "duration_ms": 15160.968,
  "stage": null,
  "result": null,
  "error": null
}
```

- `status` 是 `"ok"` ✅
- `finished_at` 有值 ✅
- `duration_ms` 有值 ✅
- **`result` 是 `null`** ❌

## 3. 复现案例

- **trace_id**：`1285b5f0-044c-49a1-a868-e2fdc1804b2e`
- **SSE 事件序列**（节选关键节点）：
  - `19:04:43.400` `event: status {state: queued}`
  - `19:04:43.467` `event: status {state: running}`
  - `19:04:43.598` `event: stage {name: intent_resolved}`
  - `19:04:43.598` `event: stage {name: dag_planned}`
  - 各 `dag_task` / `tool` start / end 正常推送
  - `19:04:58.592` `event: dag_task {task_name: t4:generate_summary_report, action: end, status: ok}`
  - `19:04:59.626` `event: done {status: "ok", duration_ms: 15204, anomaly_count: 0}`
- **done 事件之后立即调用 `GET /analyze/tasks/{trace_id}`** → 返回上面第 2 节的 JSON（`result: null`）

任务完整走完 DAG（4 个 task 都 end、最后一个 `generate_summary_report` 耗时 15s），显然已生成报告。但 result 字段没写进快照。

## 4. 问题定位（后端侧排查建议）

以下按怀疑度排序：

### P0 —— 任务完成收尾处，result 没写入快照存储

最可能的场景：任务的 summary 生成完成、后端内存里已有完整 `AnalysisResult` 对象，但在"标记任务 ok + 写 finished_at + duration_ms"这一步时**漏写了 `result` 字段**。

**排查路径**：
1. 定位任务完成后更新快照的代码（推测在 `TaskRegistry.mark_done` 或类似位置）
2. 检查更新语句是否包含 `result` 字段：
   - 是否像 `UPDATE tasks SET status='ok', finished_at=..., duration_ms=... WHERE trace_id=?` 这样**漏了 `result=?`**
   - 还是 `result` 字段在另一张表 / 另一次写入操作中，本次写操作失败或没 commit

### P1 —— 快照接口的序列化器漏返回 result

如果 DB 里其实有 result 数据，但 `GET /analyze/tasks/{id}` 的响应序列化代码没把它带出来（比如 Pydantic model 忘加字段、或者 ORM 查询只选了部分列）。

**排查路径**：
1. 直接去 DB 查 `SELECT * FROM tasks WHERE trace_id = '1285b5f0-044c-49a1-a868-e2fdc1804b2e'`
2. 如果 DB 里 result 有完整内容 → 序列化 bug，修接口
3. 如果 DB 里 result 也是 null → 写入路径 bug（P0）

### P2 —— result 写入了别的 trace_id / 被覆盖

极小概率：多个任务并发，任务完成后把 result 写到错的 trace_id 上（比如共享了可变对象、key 计算错）。可以用同一 trace_id 的 summary 去 DB 反查确认。

## 5. 验证方法（修复后请后端自测）

```bash
# 提交一个异步任务并拿到 trace_id
TID=$(curl -s -X POST http://localhost:3000/api/v1/ptp-agent/analyze/async \
  -H "Content-Type: application/json" \
  -d '{"query":"过去 30 天的收货异常分析","user_id":"u1","auto_persist":false}' \
  | jq -r .trace_id)

# 盯 SSE，等到 event: done 出现
curl -N "http://localhost:3000/api/v1/ptp-agent/analyze/tasks/$TID/events"
# (在另一个 terminal)

# 看到 done 后立即查快照
curl -s "http://localhost:3000/api/v1/ptp-agent/analyze/tasks/$TID" | jq '.status, .result'
```

### 验收标准

- [ ] 响应 `status == "ok"` 时，`result` **必须是对象，不能是 null**
- [ ] `result.report_markdown` 非空字符串（且长度 > 0）
- [ ] `result.anomalies` 是数组（可以为空数组 `[]`，但不能是 null）
- [ ] 反复跑 10 次任务，10 次都满足以上两条（不能有"偶尔 result 有偶尔 null"的抖动）

## 6. 前端侧兜底（已实施）

**改动**：[src/services/analysisStream.ts](../src/services/analysisStream.ts) 的 `fetchSnapshotUntilTerminal` 把"可交付"判定从"仅看 status"收紧为：

```ts
function isSnapshotReadyToDeliver(snap: TaskSnapshot): boolean {
  if (snap.status === 'ok') return !!snap.result;  // ok 必须带 result
  return SNAPSHOT_TERMINAL_STATUSES.has(snap.status);  // error/aborted 允许无 detail
}
```

**效果**：`{status: "ok", result: null}` 不再被视为终态，继续重试最多 3 次 × 1s；全部失败则 fallback 到"✅ 分析已完成，但报告详情暂时无法加载"占位文案。

**代价**：
- 后端修复前每次任务完成都多打 2 次快照请求
- 用户最多多等 3 秒才看到结果
- 如果后端 3s 内始终不补齐 result，用户看到占位文案而非实际报告

**兜底不替代后端修复**。后端不修，用户永远拿不到完整分析报告。

## 7. 联系人 / 后续

修复上线后前端会做一次联调验证：
- [ ] `event: done {status: ok}` 之后立即查快照，`result` 不再为 null
- [ ] `result.report_markdown` 和 SSE 流期间收到的 `dag_task end` 时序内容一致
- [ ] Network 面板里 `/analyze/tasks/{id}` 只请求 1 次（前端不再触发重试）

修复完成后请在本文档末尾追加：
- 修复 commit hash
- 修复说明（改了哪些文件/函数）

---

**附：本次复现**
- trace_id: `1285b5f0-044c-49a1-a868-e2fdc1804b2e`
- session_id: `83c139bd-123c-4b8f-9077-e0edfd26b9ff`
- 任务类型: `receipt_anomaly`
- 任务耗时: 约 15s（后端 `duration_ms: 15160.968`）
