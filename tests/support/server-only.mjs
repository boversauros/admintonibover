// Next.js resolves `server-only` to an empty module for server code and to a
// throwing one for client bundles. Plain Node has neither condition and gets
// the throwing entry, so tests (which run server modules directly) swap it
// for an empty module.
import { registerHooks } from 'node:module';

const EMPTY_MODULE = new URL('./empty.cjs', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: EMPTY_MODULE, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
