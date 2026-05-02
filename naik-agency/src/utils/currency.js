// Format a numeric value as Malaysian Ringgit — always "RM X.XX", never "MYR" or "$"
function formatRM(amount) {
  return `RM ${Number(amount).toFixed(2)}`;
}

// Strip "RM" and parse back to float (for arithmetic on user-provided strings)
function parseRM(str) {
  return parseFloat(String(str).replace(/[^0-9.]/g, ''));
}

// Format a short order ID for receipts (first 8 chars of UUID uppercased)
function shortOrderId(uuid) {
  return uuid.replace(/-/g, '').substring(0, 8).toUpperCase();
}

module.exports = { formatRM, parseRM, shortOrderId };
// ✅ src/utils/currency.js complete
