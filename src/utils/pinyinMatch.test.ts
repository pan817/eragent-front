import { matchPinyin } from './pinyinMatch'

describe('matchPinyin', () => {
  it('matches exact Chinese substring', () => {
    expect(matchPinyin('采购订单', '采购')).toBe(true)
  })

  it('matches case-insensitively for original text', () => {
    expect(matchPinyin('Hello World', 'hello')).toBe(true)
  })

  it('matches by full pinyin', () => {
    expect(matchPinyin('采购订单', 'caigou')).toBe(true)
  })

  it('matches by pinyin initials', () => {
    expect(matchPinyin('采购订单', 'cgdd')).toBe(true)
  })

  it('returns false for non-matching query', () => {
    expect(matchPinyin('采购订单', 'xiaoshou')).toBe(false)
  })

  it('handles empty query', () => {
    expect(matchPinyin('任意文本', '')).toBe(true)
  })

  it('handles empty text', () => {
    expect(matchPinyin('', '查询')).toBe(false)
  })
})
