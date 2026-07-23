export function asciiFold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function compactCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function compactPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isSubsequence(needle, haystack) {
  if (!needle) return false;
  let index = 0;
  for (const char of haystack) {
    if (index < needle.length && needle[index] === char) index += 1;
  }
  return index === needle.length;
}

export function maskPhone(value) {
  const phone = compactPhone(value);
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
}
