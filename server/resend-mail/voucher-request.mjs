export function isVoucherRequest(subject) {
  return /^neue\s+formulareingabe\s*:\s*gutschein(?:\s+|\s*[-–]\s*)bestellung$/iu.test(String(subject || '').trim());
}
