import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressBar } from './progress-bar'
import { PlanCard } from './plan-card'
import {
  computeRemainingDaysClient,
  formatMinutesDisplay,
  getPlanStatusDisplay,
  type PlanListItem,
} from '@/lib/hooks/use-plans'

describe('ProgressBar', () => {
  it('renders progress bar with label and percentage', () => {
    render(<ProgressBar value={45} label="Study Progress" />)
    expect(screen.getByText('Study Progress')).toBeDefined()
    expect(screen.getByText('45%')).toBeDefined()
    const progressbar = screen.getByRole('progressbar')
    expect(progressbar.getAttribute('aria-valuenow')).toBe('45')
  })

  it('clamps value to 100 when exceeding 100', () => {
    render(<ProgressBar value={120} label="Over Target" />)
    const progressbar = screen.getByRole('progressbar')
    expect(progressbar.getAttribute('aria-valuenow')).toBe('100')
  })

  it('clamps value to 0 when negative', () => {
    render(<ProgressBar value={-10} label="Zero" />)
    const progressbar = screen.getByRole('progressbar')
    expect(progressbar.getAttribute('aria-valuenow')).toBe('0')
  })
})

describe('Client helper functions', () => {
  it('formats minutes into hours and minutes correctly', () => {
    expect(formatMinutesDisplay(18000)).toBe('300h')
    expect(formatMinutesDisplay(4360)).toBe('72h 40m')
    expect(formatMinutesDisplay(45)).toBe('45m')
    expect(formatMinutesDisplay(0)).toBe('0m')
  })

  it('computes remaining days dynamically on client', () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    expect(computeRemainingDaysClient(future)).toBe(5)

    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    expect(computeRemainingDaysClient(past)).toBe(0)
  })

  it('returns correct display metadata for plan statuses', () => {
    expect(getPlanStatusDisplay('ACTIVE').label).toBe('Active')
    expect(getPlanStatusDisplay('COMPLETED').label).toBe('Completed')
    expect(getPlanStatusDisplay('ARCHIVED').label).toBe('Archived')
    expect(getPlanStatusDisplay('CANCELLED').label).toBe('Cancelled')
  })
})

describe('PlanCard', () => {
  const mockPlan: PlanListItem = {
    id: 'plan-1',
    userId: 'user-1',
    title: '6-Month IELTS Preparation',
    description: 'Aiming for Band 8.0',
    startDate: '2026-10-01T00:00:00.000Z',
    endDate: '2027-04-01T00:00:00.000Z',
    targetMinutes: 18000,
    status: 'ACTIVE',
    objectiveId: 'obj-1',
    examId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    remainingDays: 172,
    actualMinutes: 4360,
    studyProgressPercent: 24.22,
    objective: {
      id: 'obj-1',
      title: 'IELTS Band 8.0',
      type: 'IELTS',
    },
  }

  it('renders plan title, description, and objective', () => {
    render(<PlanCard plan={mockPlan} />)
    expect(screen.getByText('6-Month IELTS Preparation')).toBeDefined()
    expect(screen.getByText('Aiming for Band 8.0')).toBeDefined()
    expect(screen.getByText('Objective: IELTS Band 8.0')).toBeDefined()
    expect(screen.getByText('Active')).toBeDefined()
    expect(screen.getByText('Target: 300h')).toBeDefined()
    expect(screen.getByText('Studied: 72h 40m')).toBeDefined()
  })
})
