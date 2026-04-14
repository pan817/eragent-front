import {
  extractModelUsage,
  estimateTokens,
  buildModelPieData,
  BUDGET_SKIP_KEYS,
  BUDGET_KEY_LABELS,
} from './traceModel'

describe('extractModelUsage', () => {
  it('extracts from attributes.usage (DAG route)', () => {
    const attrs = { usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } }
    const result = extractModelUsage(attrs)
    expect(result.estimated).toBe(false)
    expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 50, total_tokens: 150 })
  })

  it('extracts from attributes.output.usage (new backend)', () => {
    const attrs = { output: { usage: { input_tokens: 200, output_tokens: 80, total_tokens: 280 } } }
    const result = extractModelUsage(attrs)
    expect(result.estimated).toBe(false)
    expect(result.usage?.input_tokens).toBe(200)
  })

  it('extracts from output.content via usage_metadata regex', () => {
    const attrs = {
      output: {
        content: `some text usage_metadata={'input_tokens': 300, 'output_tokens': 100, 'total_tokens': 400} more`,
      },
    }
    const result = extractModelUsage(attrs)
    expect(result.estimated).toBe(false)
    expect(result.usage).toEqual({ input_tokens: 300, output_tokens: 100, total_tokens: 400 })
  })

  it('extracts from output.content via token_usage regex', () => {
    const attrs = {
      output: {
        content: `token_usage': {'completion_tokens': 60, 'prompt_tokens': 500, 'total_tokens': 560}`,
      },
    }
    const result = extractModelUsage(attrs)
    expect(result.estimated).toBe(false)
    expect(result.usage).toEqual({ input_tokens: 500, output_tokens: 60, total_tokens: 560 })
  })

  it('falls back to estimated_input_tokens', () => {
    const attrs = { estimated_input_tokens: 1000 }
    const result = extractModelUsage(attrs)
    expect(result.estimated).toBe(true)
    expect(result.usage).toEqual({ input_tokens: 1000, output_tokens: 0, total_tokens: 1000 })
  })

  it('returns null usage when no data available', () => {
    const result = extractModelUsage({})
    expect(result.usage).toBeNull()
    expect(result.estimated).toBe(false)
  })

  it('prefers structured usage over regex', () => {
    const attrs = {
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      output: { content: `usage_metadata={'input_tokens': 999, 'output_tokens': 999, 'total_tokens': 999}` },
    }
    const result = extractModelUsage(attrs)
    expect(result.usage?.input_tokens).toBe(10)
  })
})

describe('estimateTokens', () => {
  it('estimates tokens from string length', () => {
    expect(estimateTokens('hello')).toBe(3) // ceil(5 * 0.6)
  })

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('handles Chinese characters', () => {
    expect(estimateTokens('你好世界')).toBe(3) // ceil(4 * 0.6)
  })
})

describe('buildModelPieData', () => {
  it('returns null for non-array non-string input', () => {
    expect(buildModelPieData({ input: 123 })).toBeNull()
    expect(buildModelPieData({})).toBeNull()
  })

  it('builds pie data from messages array', () => {
    const attrs = {
      input: [
        { role: 'human', content: 'Hello world' },
        { role: 'ai', content: 'Hi there!' },
      ],
    }
    const slices = buildModelPieData(attrs)
    expect(slices).not.toBeNull()
    expect(slices!.length).toBeGreaterThanOrEqual(2)
    expect(slices!.find(s => s.name === '用户消息')).toBeTruthy()
    expect(slices!.find(s => s.name === 'AI 回复')).toBeTruthy()
  })

  it('includes output tokens slice when available', () => {
    const attrs = {
      input: [{ role: 'human', content: 'test' }],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    }
    const slices = buildModelPieData(attrs)
    expect(slices!.find(s => s.name === 'Output')).toBeTruthy()
  })

  it('builds Input vs Output from string input', () => {
    const attrs = { input: 'some prompt text' }
    const slices = buildModelPieData(attrs)
    expect(slices).not.toBeNull()
    expect(slices![0].name).toBe('Input')
  })

  it('adds Output slice for string input when usage has output_tokens', () => {
    const attrs = {
      input: 'prompt',
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    }
    const slices = buildModelPieData(attrs)
    expect(slices!.find(s => s.name === 'Output')).toBeTruthy()
  })

  it('handles empty messages array', () => {
    expect(buildModelPieData({ input: [] })).toBeNull()
  })
})

describe('constants', () => {
  it('BUDGET_SKIP_KEYS excludes non-numeric fields', () => {
    expect(BUDGET_SKIP_KEYS.has('route_type')).toBe(true)
    expect(BUDGET_SKIP_KEYS.has('budget_usage_pct')).toBe(true)
  })

  it('BUDGET_KEY_LABELS has Chinese labels', () => {
    expect(BUDGET_KEY_LABELS['report_template_tokens']).toBe('报告模板')
    expect(BUDGET_KEY_LABELS['system_prompt_tokens']).toBe('系统提示')
  })
})
