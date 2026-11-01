// defuddle + linkedom extraction — contract in src/md/adapters/extractor.md. Stub.
import type { Extractor } from "../domain/ports";

export const extractor: Extractor = {
  async extract() {
    return { ok: false as const, error: "not implemented" };
  },
};
