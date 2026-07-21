/// <reference types="vite/client" />

import type { NoemaApi } from '../shared/types'

declare global {
  interface Window {
    noema: NoemaApi
  }
}
