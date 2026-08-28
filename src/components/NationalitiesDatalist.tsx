import { COMMON_NATIONALITIES } from '../constants/nationalities'

export function NationalitiesDatalist({ id = 'nationalities-options' }: { id?: string }) {
  return (
    <datalist id={id}>
      {COMMON_NATIONALITIES.map((nat) => (
        <option key={nat} value={nat} />
      ))}
    </datalist>
  )
}
