/**
 * Applies only the answer to the latest request: a slow answer for an earlier click never
 * replaces the card for a newer one. `cancel` drops whatever is still on its way.
 */
export function latestOnly() {
  let latest = 0;
  return {
    run<T>(job: Promise<T>, apply: (value: T) => void): void {
      const call = ++latest;
      void job.then((value) => {
        if (call === latest) apply(value);
      });
    },
    cancel(): void {
      latest++;
    },
  };
}
