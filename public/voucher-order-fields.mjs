const fieldPattern = /^(persönliche widmung|persoenliche widmung|widmung|(?:persönlicher )?text (?:für|fuer|auf) (?:den )?gutschein|ich bestelle einen gutschein im wert von|gutscheinwert|betrag(?: in chf)?|wert(?: in chf)?|plz\s*[/&,]\s*ort|plz und ort|postleitzahl|plz|ort|kommentar|bemerkungen?|nachricht|anzahl gutscheine|strasse\s*\/\s*nr\.?|adresse|vorname|nachname|name|e-mail|telefon)(?:\s*\(optional\))?(?:[ \t]*:[ \t]*(.*))?$/iu;

function cleanAmount(value) {
  const text = String(value || '').trim().replace(/^CHF\s*/i, '').replace(/\s*(?:CHF|Fr\.?)$/i, '');
  const match = text.match(/^(\d{1,6}|\d{1,3}(?:[’'\u00a0\u202f ]\d{3}){1,2})(?:[.,](\d{1,2}|[–—-]{1,2}))?$/u);
  if (!match) return '';
  const whole = match[1].replace(/\D/g, '');
  const fraction = /^\d+$/.test(match[2] || '') ? match[2].padEnd(2, '0') : '00';
  return whole.length <= 6 && (Number(whole) || Number(fraction)) ? Number(whole) + '.' + fraction : '';
}

export function voucherOrderFields(body) {
  const fields = new Map();
  let key;
  let lines = [];
  function finish() {
    if (!key || fields.has(key)) return;
    const value = lines.join('\n').trim();
    if (value) fields.set(key, value);
  }
  const text = String(body || '').normalize('NFC').replace(/\r\n?/g, '\n');
  const marker = /^.*übermittelte informationen\s*:\s*$/imu.exec(text);
  for (const raw of (marker ? text.slice(marker.index + marker[0].length) : text).split('\n')) {
    const line = raw.trim();
    if (/^(?:\[(?:https?:\/\/)|https?:\/\/|[- ]*original message|[- ]*ursprüngliche nachricht)/iu.test(line)) {
      if (key) break;
      continue;
    }
    const header = fieldPattern.exec(line);
    if (header) {
      finish();
      key = header[1].toLowerCase().replace(/\s+/g, ' ');
      lines = header[2] ? [header[2].trim()] : [];
    } else if (key) lines.push(line);
  }
  finish();
  const find = predicate => [...fields].find(([label]) => predicate.test(label))?.[1] || '';
  const combined = find(/^plz(?:\s*[/&,]\s*| und )ort$/i).replace(/\s+/g, ' ');
  const address = combined.match(/^(?:CH[\s-]*)?(\d{4})(?:[\s,]+(.+))?$/iu);
  const postcode = address?.[1] || find(/^(?:plz|postleitzahl)$/i).match(/^(?:CH[\s-]*)?(\d{4})\b/iu)?.[1] || '';
  const city = address?.[2] || find(/^ort$/i).replace(/\s+/g, ' ');
  const explicit = find(/widmung|^text |^persönlicher text/i);
  const comment = find(/^(?:kommentar|bemerkungen?|nachricht)$/i);
  const fulfilmentNote = /\b(?:bis spätestens|versand|abhol(?:en|ung)|rechnungsadresse|bitte zustellen|bitte (?:senden|schicken)|als pdf|per e-mail|ich brauche den gutschein bis)\b/iu.test(comment);
  const dedication = explicit || (fulfilmentNote ? '' : comment);
  return {
    amount: cleanAmount(find(/^(?:ich bestelle|gutscheinwert|betrag|wert)/i)),
    note: dedication,
    postcode,
    city,
    comment: comment && comment !== dedication ? comment : '',
  };
}
