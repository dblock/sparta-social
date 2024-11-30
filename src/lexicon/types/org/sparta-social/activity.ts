/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { lexicons } from '../../../lexicons'
import { isObj, hasProp } from '../../../util'
import { CID } from 'multiformats/cid'

export interface Record {
  title: string
  description?: string
  activityType: string
  distanceInCm?: number
  movingTimeInMs?: number
  elapsedTimeInMs?: number
  totalElevationGainInCm?: number
  mapPolyline?: string
  startAtInUTC?: string
  startAtTimeZone?: string
  createdAt: string
  [k: string]: unknown
}

export function isRecord(v: unknown): v is Record {
  return (
    isObj(v) &&
    hasProp(v, '$type') &&
    (v.$type === 'org.sparta-social.activity#main' ||
      v.$type === 'org.sparta-social.activity')
  )
}

export function validateRecord(v: unknown): ValidationResult {
  return lexicons.validate('org.sparta-social.activity#main', v)
}
