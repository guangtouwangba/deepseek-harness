/** Reuse the checkout's browser factory and CSS-module compiler for this local bundle. */
import { clientBundle } from '../../packages/client/tsdown.client.ts'
export default clientBundle(import.meta.dirname, ['index.js'])
