/** Clean expired records after real activity; never keep an idle database awake. */
export function activityMaintenance(
  cleanup: () => Promise<void>,
  onError: () => void,
  intervalMs = 15 * 60_000,
  now = Date.now,
) {
  let next = 0;
  let pending: Promise<void> | undefined;
  return {
    touch() {
      if (pending || now() < next) return;
      next = now() + intervalMs;
      pending = cleanup()
        .catch(onError)
        .finally(() => {
          pending = undefined;
        });
    },
    async drain() {
      await pending;
    },
  };
}
