import type { Dict } from '../i18n'
import { mapAppError } from './errors'

export function mapReservationSaveError(err: unknown, t: Dict) {
  return mapAppError(err, t)
}
