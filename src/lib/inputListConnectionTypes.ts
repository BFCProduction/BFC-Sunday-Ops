import type { InputListConnectionType } from '../types'

export const INPUT_LIST_CONNECTION_TYPES: Array<{
  key: InputListConnectionType
  label: string
}> = [
  { key: 'audio_input', label: 'Audio Input' },
  { key: 'audio_output', label: 'Audio Output' },
  { key: 'monitor_output', label: 'Monitor Output' },
  { key: 'network', label: 'Network' },
  { key: 'fiber', label: 'Fiber' },
  { key: 'bnc', label: 'BNC' },
]
