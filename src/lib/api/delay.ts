/** Simulates network latency (400-800 ms). Replace with real fetch calls later. */
export function delay(min = 400, max = 800): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
