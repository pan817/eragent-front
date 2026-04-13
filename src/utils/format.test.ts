import { formatMs, formatRelativeTime, formatRelativeTimeFromTs } from './format'

describe('formatMs', () => {
  it('formats milliseconds below 1000 as ms', () => {
    expect(formatMs(0)).toBe('0ms')
    expect(formatMs(123)).toBe('123ms')
    expect(formatMs(999)).toBe('999ms')
  })

  it('rounds fractional milliseconds', () => {
    expect(formatMs(1.4)).toBe('1ms')
    expect(formatMs(1.5)).toBe('2ms')
  })

  it('formats 1000+ as seconds with one decimal', () => {
    expect(formatMs(1000)).toBe('1.0s')
    expect(formatMs(1500)).toBe('1.5s')
    expect(formatMs(12345)).toBe('12.3s')
  })
})

describe('formatRelativeTime', () => {
  it('returns 刚刚 for < 10 seconds', () => {
    const date = new Date(Date.now() - 5000)
    expect(formatRelativeTime(date)).toBe('刚刚')
  })

  it('returns N 秒前 for 10-59 seconds', () => {
    const date = new Date(Date.now() - 30_000)
    expect(formatRelativeTime(date)).toBe('30 秒前')
  })

  it('returns N 分钟前 for 1-59 minutes', () => {
    const date = new Date(Date.now() - 5 * 60_000)
    expect(formatRelativeTime(date)).toBe('5 分钟前')
  })

  it('returns N 小时前 for 1-23 hours', () => {
    const date = new Date(Date.now() - 3 * 3600_000)
    expect(formatRelativeTime(date)).toBe('3 小时前')
  })

  it('falls back to locale date string for 24h+', () => {
    const date = new Date(Date.now() - 2 * 86400_000)
    expect(formatRelativeTime(date)).toBe(date.toLocaleDateString())
  })
})

describe('formatRelativeTimeFromTs', () => {
  it('returns 刚刚 for < 60 seconds', () => {
    expect(formatRelativeTimeFromTs(Date.now() - 30_000)).toBe('刚刚')
  })

  it('returns N分钟前 for 1-59 minutes', () => {
    expect(formatRelativeTimeFromTs(Date.now() - 5 * 60_000)).toBe('5分钟前')
  })

  it('returns N小时前 for 1-23 hours', () => {
    expect(formatRelativeTimeFromTs(Date.now() - 3 * 3600_000)).toBe('3小时前')
  })

  it('returns N天前 for 1-6 days', () => {
    expect(formatRelativeTimeFromTs(Date.now() - 3 * 86400_000)).toBe('3天前')
  })

  it('returns M/D for 7+ days', () => {
    const ts = Date.now() - 10 * 86400_000
    const d = new Date(ts)
    expect(formatRelativeTimeFromTs(ts)).toBe(`${d.getMonth() + 1}/${d.getDate()}`)
  })
})
