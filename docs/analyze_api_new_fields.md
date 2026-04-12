# /api/v1/analyze 新增字段要求

> 本文档描述前端新增的 3 个配置能力对后端 `/api/v1/analyze` 接口的字段要求。

## 1. 输出模式 `output_mode`

### 字段定义

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `output_mode` | `string` | 否 | `"detailed"` | 控制分析结果的输出格式 |

### 可选值

| 值 | 含义 | 后端处理建议 |
|---|---|---|
| `"detailed"` | 详细报告（默认） | 完整的分析报告，包含背景、指标、图表描述、结论与建议 |
| `"brief"` | 简报摘要 | 精简到 3-5 个要点，适合快速浏览或汇报。建议在 system prompt 中追加输出约束，如"请用不超过 200 字的要点形式输出" |
| `"table"` | 数据表格 | 以 Markdown 表格为主体呈现关键数据，辅以简短结论。建议在 system prompt 中追加"请优先使用表格呈现数据，减少叙述性文字" |

### 请求示例

```json
{
  "query": "分析最近30天的采购订单异常",
  "user_id": "alice",
  "session_id": "abc-123",
  "output_mode": "brief"
}
```

### 后端实现建议

在构造 LLM system prompt 时，根据 `output_mode` 追加格式指令：

```python
OUTPUT_MODE_PROMPTS = {
    "detailed": "",  # 默认不追加
    "brief": "请以简报摘要形式输出，控制在 3-5 个要点，总字数不超过 200 字。",
    "table": "请优先使用 Markdown 表格呈现核心数据，辅以不超过 2 句话的结论。",
}
```

---

## 2. 时间范围 `time_range`

### 字段定义

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `time_range` | `string` | 否 | 不传（不限时间） | 数据查询的时间窗口 |

### 可选值

| 值 | 含义 | 对应日期范围（示例，假设当前为 2026-04-12） |
|---|---|---|
| `"7d"` | 最近 7 天 | 2026-04-05 ~ 2026-04-12 |
| `"30d"` | 最近 30 天 | 2026-03-13 ~ 2026-04-12 |
| `"90d"` | 最近 90 天 | 2026-01-12 ~ 2026-04-12 |
| `"this_month"` | 本月 | 2026-04-01 ~ 2026-04-12 |
| `"last_month"` | 上月 | 2026-03-01 ~ 2026-03-31 |
| 不传 | 不限时间 | 查询全部数据 |

### 请求示例

```json
{
  "query": "分析采购订单异常",
  "user_id": "alice",
  "session_id": "abc-123",
  "time_range": "30d"
}
```

### 后端实现建议

**方式 A（推荐）：在 SQL/查询层直接过滤**

后端收到 `time_range` 后，解析为具体的起止日期，在数据查询工具（如 SQL 查询）中自动注入 `WHERE created_at >= ? AND created_at <= ?` 条件。这样 LLM 不需要感知时间过滤，数据本身就已经是限定范围内的。

```python
from datetime import datetime, timedelta

def parse_time_range(time_range: str) -> tuple[datetime, datetime]:
    now = datetime.now()
    if time_range == "7d":
        return (now - timedelta(days=7), now)
    elif time_range == "30d":
        return (now - timedelta(days=30), now)
    elif time_range == "90d":
        return (now - timedelta(days=90), now)
    elif time_range == "this_month":
        return (now.replace(day=1), now)
    elif time_range == "last_month":
        first_this = now.replace(day=1)
        last_month_end = first_this - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)
        return (last_month_start, last_month_end)
    else:
        return (None, None)  # 不限
```

**方式 B：注入到 LLM prompt**

如果数据查询无法在 SQL 层过滤，也可以在 system prompt 中追加时间约束提示，让 LLM 在分析时自行过滤。效果不如方式 A 精确。

---

## 3. 导出/复制（纯前端，不需要后端变更）

导出功能完全由前端实现，不需要后端接口变更：

| 功能 | 实现方式 |
|---|---|
| 复制 Markdown | `navigator.clipboard.writeText(message.content)` — 直接复制原始 Markdown |
| 复制纯文本 | 前端 strip Markdown 语法后复制纯文本 |
| 打印/导出 PDF | 前端将渲染后的 HTML 写入新窗口，调用 `window.print()`，由浏览器打印功能导出 PDF |

---

## 完整请求示例（3 个新字段同时使用）

```json
{
  "query": "分析采购订单异常",
  "user_id": "alice",
  "session_id": "abc-123",
  "analyst_role": "procurement",
  "output_mode": "table",
  "time_range": "30d",
  "auto_persist": true,
  "metadata": {
    "use_ext_data": false
  }
}
```

## 响应无变化

`AnalyzeResponse` 结构不需要修改。`output_mode` 和 `time_range` 只影响后端的查询范围和 LLM prompt，最终仍然返回 `report_markdown` 字段。
