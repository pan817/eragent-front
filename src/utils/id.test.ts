import { genId } from './id'

describe('genId', () => {
  it('returns a non-empty string', () => {
    expect(genId()).toBeTruthy()
  })

  it('returns unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => genId()))
    expect(ids.size).toBe(100)
  })

  it('returns UUID format when crypto.randomUUID is available', () => {
    const id = genId()
    // jsdom provides crypto.randomUUID, so should be UUID v4
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
