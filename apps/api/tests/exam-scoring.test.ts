import { describe, it, expect } from 'vitest'
import {
  SCORE_SCALE_DEFAULTS,
  SCORE_SCALE_PRESETS,
  getPreset,
  resolveScoreScale,
  validateExamScores,
} from '../src/modules/exams/exam.scoring.js'

describe('built-in score scales', () => {
  it('describes the IELTS band scale as a half-band scale out of 9', () => {
    const ielts = getPreset('IELTS_BAND')

    expect(ielts).not.toBeNull()
    expect(ielts?.min).toBe(0)
    expect(ielts?.max).toBe(9)
    expect(ielts?.step).toBe(0.5)
    expect(ielts?.decimals).toBe(1)
    expect(ielts?.targetLabel).toBe('Target band')
    expect(ielts?.sections.map((section) => section.key)).toEqual([
      'listening',
      'reading',
      'writing',
      'speaking',
    ])
    expect(ielts?.sections.every((section) => section.max === 9)).toBe(true)
  })

  it('describes the TOEFL total scale as a 0–120 scale with four 30-point sections', () => {
    const toefl = getPreset('TOEFL_TOTAL')

    expect(toefl?.max).toBe(120)
    expect(toefl?.step).toBe(1)
    expect(toefl?.decimals).toBe(0)
    expect(toefl?.targetLabel).toBe('Target score')
    expect(toefl?.sections.every((section) => section.max === 30)).toBe(true)
  })

  it('defaults each exam type to its own scale and leaves OTHER unbounded', () => {
    expect(SCORE_SCALE_DEFAULTS.IELTS).toBe('IELTS_BAND')
    expect(SCORE_SCALE_DEFAULTS.TOEFL).toBe('TOEFL_TOTAL')
    expect(SCORE_SCALE_DEFAULTS.OTHER).toBeNull()

    expect(SCORE_SCALE_PRESETS.map((preset) => preset.key)).toEqual(['IELTS_BAND', 'TOEFL_TOTAL'])
  })
})

describe('resolving an exam scoring scale', () => {
  it('falls back to the type default and says so', () => {
    const resolved = resolveScoreScale({ type: 'IELTS', stored: null })

    expect(resolved.scale?.key).toBe('IELTS_BAND')
    expect(resolved.source).toBe('TYPE_DEFAULT')
  })

  it('reports an unbounded exam type as having no scale rather than inventing one', () => {
    const resolved = resolveScoreScale({ type: 'OTHER', stored: null })

    expect(resolved.scale).toBeNull()
    expect(resolved.source).toBe('NONE')
  })

  it('honours a stored descriptor over the type default', () => {
    const resolved = resolveScoreScale({
      type: 'IELTS',
      stored: { key: 'IELTS_BAND', label: 'IELTS band (mock provider)' },
    })

    expect(resolved.source).toBe('EXAM')
    expect(resolved.scale?.label).toBe('IELTS band (mock provider)')
    expect(resolved.scale?.max).toBe(9)
  })

  it('supports a new scoring scheme as pure data, with no schema change', () => {
    // A future TOEFL format scored 1–6 in half bands. It arrives as a stored
    // descriptor; nothing in the database or the API shape had to change.
    const resolved = resolveScoreScale({
      type: 'TOEFL',
      stored: {
        key: 'TOEFL_BAND_2027',
        label: 'TOEFL band (2027 format)',
        kind: 'BAND',
        min: 1,
        max: 6,
        step: 0.5,
        targetLabel: 'Target band',
        sections: [
          { key: 'listening', label: 'Listening', max: 6 },
          { key: 'reading', label: 'Reading', max: 6 },
          { key: 'writing', label: 'Writing', max: 6 },
          { key: 'speaking', label: 'Speaking', max: 6 },
        ],
      },
    })

    expect(resolved.source).toBe('EXAM')
    expect(resolved.scale?.max).toBe(6)
    expect(resolved.scale?.min).toBe(1)
    expect(resolved.scale?.decimals).toBe(1)
    expect(resolved.scale?.targetLabel).toBe('Target band')
  })

  it('refuses an unknown scale key that does not say what its maximum is', () => {
    expect(() => resolveScoreScale({ type: 'TOEFL', stored: { key: 'TOEFL_TOTAL_V2' } })).toThrow(
      /unknown score scale/i,
    )
  })

  it('accepts an unknown scale key that states an explicit unbounded maximum', () => {
    const resolved = resolveScoreScale({
      type: 'OTHER',
      stored: { key: 'CUSTOM_SELF', label: 'Self rating', max: null, min: 0 },
    })

    expect(resolved.scale?.max).toBeNull()
    expect(resolved.scale?.sections).toEqual([])
  })

  it('rejects a descriptor that is not an object with a key, or whose bounds are impossible', () => {
    expect(() => resolveScoreScale({ type: 'IELTS', stored: 'IELTS_BAND' })).toThrow(/\bkey\b/)
    expect(() =>
      resolveScoreScale({ type: 'IELTS', stored: { key: 'BROKEN', label: 'Broken', min: 9, max: 9 } }),
    ).toThrow(/above its minimum/i)
    expect(() =>
      resolveScoreScale({ type: 'IELTS', stored: { key: 'BROKEN', label: 'Broken', max: 10, step: 0 } }),
    ).toThrow(/positive step/i)
  })
})

describe('validating recorded scores against the exam scale', () => {
  const ielts = getPreset('IELTS_BAND')
  const toefl = getPreset('TOEFL_TOTAL')

  it('accepts a TOEFL total of 110 — the value the previous fixed cap rejected', () => {
    expect(validateExamScores(toefl, { overallScore: 110 })).toEqual([])
    expect(
      validateExamScores(toefl, {
        overallScore: 110,
        skillScores: { listening: 30, reading: 30, writing: 25, speaking: 25 },
      }),
    ).toEqual([])
  })

  it('rejects a score above the scale maximum and names the scale', () => {
    const issues = validateExamScores(ielts, { overallScore: 9.5 })

    expect(issues).toHaveLength(1)
    expect(issues[0]?.field).toBe('overallScore')
    expect(issues[0]?.message).toContain('IELTS band')
  })

  it('rejects a section above its own maximum', () => {
    const issues = validateExamScores(toefl, { skillScores: { listening: 31 } })

    expect(issues).toHaveLength(1)
    expect(issues[0]?.field).toBe('skillScores.listening')
    expect(issues[0]?.message).toContain('between 0 and 30')
  })

  it('rejects a section key the scale does not define', () => {
    const issues = validateExamScores(ielts, { skillScores: { pronunciation: 7 } })

    expect(issues[0]?.field).toBe('skillScores.pronunciation')
    expect(issues[0]?.message).toContain('listening')
  })

  it('rejects a result that records no score at all', () => {
    const issues = validateExamScores(ielts, {})

    expect(issues).toHaveLength(1)
    expect(issues[0]?.field).toBe('overallScore')
  })

  it('accepts a sections-only result without demanding a fabricated overall', () => {
    expect(validateExamScores(ielts, { skillScores: { listening: 7.5, speaking: 7 } })).toEqual([])
  })

  it('rejects negative scores and tolerates precision finer than the step', () => {
    expect(validateExamScores(ielts, { overallScore: -0.5 })).toHaveLength(1)
    // A mock provider reporting 7.3 is stored as reported: `step` is a rendering
    // hint, not a hard constraint.
    expect(validateExamScores(ielts, { overallScore: 7.3 })).toEqual([])
  })

  it('only enforces non-negativity when the exam has no scale', () => {
    expect(validateExamScores(null, { overallScore: 500 })).toEqual([])
    expect(validateExamScores(null, { overallScore: -1 })).toHaveLength(1)
    // No scale means no section vocabulary to validate against.
    expect(validateExamScores(null, { skillScores: { anything: 12 } })).toEqual([])
  })
})
