// Utility formatters: job number, currency, date
export const formatJobNumber = (input: string | number): string => {
  if (input == null) return "000000";
  const digits = String(input).replace(/\D/g, "");
  return digits.padStart(6, "0").slice(-6);
};

/**
 * formatCurrency
 * - Accepts number or string
 * - Returns string always starting with $ and using en-US formatting.
 * - If input is not parseable, returns input as-is.
 */
export const formatCurrency = (input: number | string): string => {
  if (input == null || input === "") return "$0.00";
  // remove common currency symbols and whitespace
  const cleaned = String(input).replace(/[$,]/g, "").trim();
  const n = Number(cleaned);
  if (Number.isNaN(n)) {
    // fallback: if input already contains a leading $ keep it, otherwise prefix $
    return String(input).startsWith("$") ? String(input) : `$${String(input)}`;
  }
  // always format with 2 decimals
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * formatDate - returns mm/dd/yyyy
 * Accepts Date, timestamp, or date string.
 */
export const formatDate = (value: string | number | Date | null): string => {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
};
