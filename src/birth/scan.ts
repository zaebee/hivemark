/**
 * Grouping the chain's birth attestations by the entity they name.
 *
 * Small enough to inline, and deliberately not inlined: this map is what stops
 * a second birth being announced for an entity that already has one, and the
 * remedy for getting it wrong is that there is no remedy. It lives here so it
 * can be tested against a log the chain is not obliged to give us.
 */

/** The fields this needs from a `getLogs` result, and no more. */
export interface AttestedLog {
  readonly args: {
    readonly recipient?: `0x${string}` | undefined;
    readonly uid?: `0x${string}` | undefined;
  };
  readonly blockNumber?: bigint | null;
  readonly transactionHash?: `0x${string}` | null;
}

/**
 * Index birth attestations by recipient.
 *
 * `viem`'s `getLogs` is not strict by default, so a log it could not fully
 * decode still arrives, with its arguments missing. Skipping such a log is the
 * dangerous reading: a birth dropped here is an entity that reads as unborn,
 * and this map is consulted immediately before announcing one. Refusing the
 * whole scan is recoverable — look at the log, and run it again. Announcing a
 * second birth is not.
 */
export function indexBirths(logs: readonly AttestedLog[]): Map<string, `0x${string}`[]> {
  const byEntity = new Map<string, `0x${string}`[]>();
  for (const log of logs) {
    const { recipient, uid } = log.args;
    if (!recipient || !uid) {
      throw new Error(
        `Attested log at block ${log.blockNumber ?? "?"} (tx ${log.transactionHash ?? "?"}) ` +
          "decoded without a recipient or uid; refusing to judge births from a partial scan",
      );
    }
    // Keyed lowercase: hex casing carries no meaning, and a checksummed address
    // that missed a lowercase key would read as "not yet born".
    const key = recipient.toLowerCase();
    byEntity.set(key, [...(byEntity.get(key) ?? []), uid]);
  }
  return byEntity;
}
