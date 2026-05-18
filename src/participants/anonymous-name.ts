export function anonymousNameForJoinOrder(joinOrder: number): string {
  if (!Number.isInteger(joinOrder) || joinOrder < 1) {
    throw new Error('joinOrder must be a positive integer');
  }

  let value = joinOrder;
  let suffix = '';

  while (value > 0) {
    value -= 1;
    suffix = String.fromCharCode(65 + (value % 26)) + suffix;
    value = Math.floor(value / 26);
  }

  return `Member ${suffix}`;
}
