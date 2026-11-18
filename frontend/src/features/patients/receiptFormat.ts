const CURRENCY_LABEL = "Rs.";
const MAX_FRACTION_DIGITS = 2;

export function formatAmount(amount: number): string {
  return `${CURRENCY_LABEL} ${amount.toLocaleString(undefined, {
    maximumFractionDigits: MAX_FRACTION_DIGITS,
  })}`;
}