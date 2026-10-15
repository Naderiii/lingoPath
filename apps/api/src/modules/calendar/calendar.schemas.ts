import { z } from 'zod'
import { DAY_KEY_PATTERN, isDayKey, isValidTimeZone } from '../../shared/timezone.js'
import { MAX_INTENSITY_THRESHOLDS, MAX_STREAK_QUALIFYING_MINUTES } from './calendar.domain.js'

/**
 * Validation for the calendar module. These schemas live next to the routes
 * rather than in `@lingopath/types` on purpose: the routes are covered by unit
 * tests that must run straight after `pnpm install`, without depending on the
 * shared package's build output.
 */

const dayKeySchema = z
  .string()
  .regex(DAY_KEY_PATTERN, 'Expected a date formatted as YYYY-MM-DD')
  .refine(isDayKey, 'Not a real calendar date')

const timeZoneSchema = z.string().min(1).max(64).refine(isValidTimeZone, 'Unknown IANA timezone')

/**
 * Accepts either a repeated query parameter or a comma-separated list, e.g.
 * `?intensityThresholds=20,40,60,90`. The values are the *upper bound of each
 * bucket above zero*, so `[20, 40, 60, 90]` yields the spec scale
 * `1–20 | 21–40 | 41–60 | 61–90 | 90+`.
 */
const intensityThresholdsSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    (Array.isArray(value) ? value : value.split(','))
      .flatMap((part) => part.split(','))
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map(Number),
  )
  .refine(
    (values) => values.length > 0 && values.every((value) => Number.isFinite(value) && value > 0),
    'intensityThresholds must contain positive minute values',
  )
  .refine(
    (values) => values.length <= MAX_INTENSITY_THRESHOLDS,
    `At most ${MAX_INTENSITY_THRESHOLDS} intensity thresholds are supported`,
  )
  .refine(
    (values) => new Set(values).size === values.length,
    'intensityThresholds must not contain duplicates',
  )

const streakQualifyingMinutesSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(MAX_STREAK_QUALIFYING_MINUTES)

export const CalendarQuerySchema = z
  .object({
    year: z.coerce.number().int().min(1970).max(2100).optional(),
    from: dayKeySchema.optional(),
    to: dayKeySchema.optional(),
    timezone: timeZoneSchema.optional(),
    intensityThresholds: intensityThresholdsSchema.optional(),
    streakQualifyingMinutes: streakQualifyingMinutesSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const hasFrom = value.from !== undefined
    const hasTo = value.to !== undefined

    if (hasFrom !== hasTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: '`from` and `to` must be provided together',
      })
    }

    if (value.year !== undefined && hasFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['year'],
        message: '`year` cannot be combined with `from`/`to`',
      })
    }

    if (
      hasFrom &&
      hasTo &&
      isDayKey(value.from!) &&
      isDayKey(value.to!) &&
      value.from! > value.to!
    ) {
      // Compared as strings: zero-padded `YYYY-MM-DD` keys sort chronologically,
      // and this stays safe even while other field errors are still being
      // collected (Zod runs object-level refinements on partial data).
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: '`from` must not be after `to`',
      })
    }
  })

export type CalendarQuery = z.infer<typeof CalendarQuerySchema>

export const StreakQuerySchema = z.object({
  timezone: timeZoneSchema.optional(),
  streakQualifyingMinutes: streakQualifyingMinutesSchema.optional(),
})

export type StreakQuery = z.infer<typeof StreakQuerySchema>

export const CalendarSettingsQuerySchema = z.object({
  timezone: timeZoneSchema.optional(),
})

export const UpdateCalendarSettingsSchema = z
  .object({
    intensityThresholds: z
      .array(z.number().int().min(1).max(MAX_STREAK_QUALIFYING_MINUTES))
      .min(1)
      .max(MAX_INTENSITY_THRESHOLDS)
      .optional(),
    streakQualifyingMinutes: streakQualifyingMinutesSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.intensityThresholds !== undefined || value.streakQualifyingMinutes !== undefined,
    'Provide intensityThresholds and/or streakQualifyingMinutes',
  )

export type UpdateCalendarSettingsBody = z.infer<typeof UpdateCalendarSettingsSchema>

export const CalendarDayParamsSchema = z.object({
  date: dayKeySchema,
})

export type CalendarDayParams = z.infer<typeof CalendarDayParamsSchema>
