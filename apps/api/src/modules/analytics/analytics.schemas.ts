import { z } from 'zod'
import { DAY_KEY_PATTERN, diffDayKeys, isDayKey, isValidTimeZone } from '../../shared/timezone.js'
import { ANALYTICS_RANGES, MAX_ANALYTICS_RANGE_DAYS } from './analytics.domain.js'

/**
 * Validation for the analytics endpoint. Both sides of a custom range are
 * checked here (shape, real calendar dates, ordering, cap) so the service never
 * sees a reversed or unbounded window.
 */

const dayKeySchema = z
  .string()
  .regex(DAY_KEY_PATTERN, 'Expected a date formatted as YYYY-MM-DD')
  .refine(isDayKey, 'Not a real calendar date')

const timeZoneSchema = z.string().min(1).max(64).refine(isValidTimeZone, 'Unknown IANA timezone')

export const AnalyticsQuerySchema = z
  .object({
    range: z.enum(ANALYTICS_RANGES).default('30d'),
    from: dayKeySchema.optional(),
    to: dayKeySchema.optional(),
    timezone: timeZoneSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const hasFrom = value.from !== undefined
    const hasTo = value.to !== undefined

    if (value.range !== 'custom' && (hasFrom || hasTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['range'],
        message: '`from`/`to` are only allowed with range=custom',
      })
    }

    if (value.range === 'custom' && (!hasFrom || !hasTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'range=custom requires both `from` and `to`',
      })
    }

    if (hasFrom && hasTo && isDayKey(value.from!) && isDayKey(value.to!)) {
      // String comparison is safe for zero-padded keys and also works while other
      // field errors are still being collected.
      if (value.from! > value.to!) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['from'],
          message: '`from` must not be after `to`',
        })
      } else if (diffDayKeys(value.from!, value.to!) + 1 > MAX_ANALYTICS_RANGE_DAYS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['to'],
          message: `Ranges are limited to ${MAX_ANALYTICS_RANGE_DAYS} days`,
        })
      }
    }
  })

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>
