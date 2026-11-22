import {PDFDocument, StandardFonts, rgb} from 'npm:pdf-lib@1.17.1';
import QRCode from 'npm:qrcode@1.5.4';
import {fondueJpg, companyPng} from './assets.mjs';
import {dedicationEmoji} from './dedication-emoji.mjs';

const mm = value => value * 72 / 25.4;
const width = mm(210);
const height = mm(297);
const black = rgb(0, 0, 0);
const white = rgb(1, 1, 1);
const business = 'SOO! Event & Catering GmbH';
const address = 'Trottenstrasse 20';
const location = '8180 Bülach';
const iban = 'CH5580808009564340831';
const printIban = 'CH55 8080 8009 5643 4083 1';
const formatDate = (date, long = false) => new Intl.DateTimeFormat('de-CH', {
  day: '2-digit', month: long ? 'long' : '2-digit', year: 'numeric', timeZone: 'UTC',
}).format(new Date(date + 'T12:00:00Z'));
const amount = d => (d.amount_cents / 100).toFixed(2);

function fits(font, source, size, maxWidth) {
  for (let current = size; current >= 6; current -= 0.5) {
    if (font.widthOfTextAtSize(source, current) <= maxWidth) return current;
  }
  throw new Error('Der Text ist für das PDF zu lang.');
}

const graphemes = new Intl.Segmenter('de-CH', {granularity: 'grapheme'});

function dedicationRuns(text) {
  const runs = [];
  let pending = '';
  for (const {segment} of graphemes.segment(text)) {
    const code = [...segment.replace(/\uFE0F/g, '')].map(char => char.codePointAt(0).toString(16)).join('-');
    if (dedicationEmoji[code]) {
      if (pending) runs.push({text: pending});
      runs.push({emoji: code});
      pending = '';
    } else pending += segment;
  }
  if (pending) runs.push({text: pending});
  return runs;
}

const runWidth = (run, font, size) => run.emoji ? size * 1.1 : font.widthOfTextAtSize(run.text, size);
const dedicationFont = font => ({
  widthOfTextAtSize: (text, size) => dedicationRuns(text).reduce((total, run) => total + runWidth(run, font, size), 0),
});

function wrap(value, font, size, maxWidth) {
  const result = [];
  for (const paragraph of value.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (font.widthOfTextAtSize(word, size) > maxWidth) throw new Error('Ein Wort in der Widmung ist zu lang.');
      const joined = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(joined, size) <= maxWidth) line = joined;
      else { result.push(line); line = word; }
    }
    result.push(line);
  }
  return result;
}

async function document(title, date) {
  const stamp = new Date(date + 'T12:00:00Z');
  const pdf = await PDFDocument.create({updateMetadata: false});
  pdf.setTitle(title);
  pdf.setAuthor(business);
  pdf.setCreationDate(stamp);
  pdf.setModificationDate(stamp);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  return {pdf, regular, bold};
}

function draw(page, regular, bold) {
  function text(value, x, top, size = 10, options = {}) {
    const font = options.bold ? bold : regular;
    const fontSize = options.fit ? fits(font, value, size, options.fit) : size;
    const measure = font.widthOfTextAtSize(value, fontSize);
    const offset = options.align === 'center' ? measure / 2 : options.align === 'right' ? measure : 0;
    page.drawText(value, {x: x - offset, y: height - top - fontSize, font, size: fontSize, color: options.color || black});
  }
  function line(x, top, toX, toTop = top, dashed = false) {
    page.drawLine({start: {x, y: height - top}, end: {x: toX, y: height - toTop},
      thickness: dashed ? 0.6 : 0.45, color: black, ...(dashed ? {dashArray: [2, 2]} : {})});
  }
  function rect(x, top, w, h, color = black) {
    page.drawRectangle({x, y: height - top - h, width: w, height: h, color});
  }
  function image(asset, x, top, w, h) {
    page.drawImage(asset, {x, y: height - top - h, width: w, height: h});
  }
  return {text, line, rect, image};
}

export function normalizeVoucher(input, font) {
  const field = (key, label, max, optional = false, multiline = false) => {
    if (typeof input[key] !== 'string' && !(optional && input[key] == null)) throw new Error(label + ' prüfen.');
    const value = (input[key] || '').normalize('NFC').replace(/\r\n?/g, '\n').trim();
    const lines = multiline ? value.split('\n') : [value];
    if ((!value && !optional) || value.length > max || lines.some(line => /[\u0000-\u001f\u007f-\u009f]/u.test(line))) {
      throw new Error(label + ' prüfen.');
    }
    try {
      for (const line of lines) {
        if (key === 'note') dedicationRuns(line).forEach(run => { if (run.text) font.encodeText(run.text); });
        else font.encodeText(line);
      }
    }
    catch { throw new Error(label + ' enthält ein Zeichen, das im PDF nicht dargestellt werden kann.'); }
    return value;
  };
  const name = field('name', 'Rechnungsname', 70);
  const street = field('street', 'Strasse', 70);
  const building = field('building', 'Hausnummer', 16, true);
  const postcode = field('postcode', 'Postleitzahl', 4);
  const city = field('city', 'Ort', 35);
  const email = field('email', 'E-Mail-Adresse', 254).toLowerCase();
  const note = field('note', 'Widmung', 320, true, true);
  // Payment address fields follow the SIX character set.
  const addressAlphabet = /^[a-zA-Z0-9\p{Script=Latin} .,'+\-/:()?&%*=;_\[\]{}@#~^|!$€£"\\]*$/u;
  if (![name, street, building, city].every(value => addressAlphabet.test(value))) throw new Error('Sonderzeichen in der Rechnungsadresse prüfen.');
  if (!/^\d{4}$/.test(postcode)) throw new Error('Bitte eine vierstellige Schweizer Postleitzahl eingeben.');
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) throw new Error('E-Mail-Adresse prüfen.');
  for (const part of [name, [street, building].filter(Boolean).join(' '), postcode + ' ' + city]) {
    if (wrap(part, font, 8, mm(51)).length > 3) throw new Error('Die Rechnungsadresse ist für den Empfangsschein zu lang.');
  }
  const entered = typeof input.amount === 'string' ? input.amount.trim().replace(',', '.') : '';
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(entered)) throw new Error('Bitte einen CHF-Betrag mit höchstens zwei Rappenstellen eingeben.');
  const amount_cents = Math.round(Number(entered) * 100);
  if (amount_cents <= 0) throw new Error('Der Betrag muss grösser als CHF 0.00 sein.');
  if (note && wrap(note, dedicationFont(font), 14, width - 130).length > 6) throw new Error('Die Widmung darf im Gutschein höchstens sechs Zeilen belegen.');
  return {name, street, building, postcode, city, email, note, amount_cents};
}

export async function validateVoucher(input) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  return normalizeVoucher(input, font);
}

const paymentNote = (d, demo) => demo ? 'NICHT ZUR ZAHLUNG VERWENDEN' : 'Rechnung ' + d.invoice_no;
const paymentAmount = (d, demo) => demo ? '0.00' : amount(d);

export function paymentPayload(d, demo = false) {
  return ['SPC', '0200', '1', iban, 'S', business, 'Trottenstrasse', '20', '8180', 'Bülach', 'CH',
    '', '', '', '', '', '', '', paymentAmount(d, demo), 'CHF',
    'S', d.name, d.street, d.building, d.postcode, d.city, 'CH',
    'NON', '', paymentNote(d, demo), 'EPD'].join('\n');
}

function qrSlip(d, page, fonts, demo) {
  const {text, line, rect} = draw(page, fonts.regular, fonts.bold);
  const ink = (x, y, value, size, options) => text(value, mm(x), mm(y + 192), size, options);
  const rule = (x, y, x2, y2) => line(mm(x), mm(y + 192), mm(x2), mm(y2 + 192), true);
  rule(0, 0, 210, 0);
  rule(62, 0, 62, 105);
  function scissors(x, y, vertical = false) {
    const point = (a, b) => ({x: mm(x + (vertical ? -b : a)), y: height - mm(192 + y + (vertical ? a : b))});
    page.drawCircle({...point(-1.45, -0.72), size: mm(0.55), color: white, borderColor: black, borderWidth: 0.6});
    page.drawCircle({...point(-1.45, 0.72), size: mm(0.55), color: white, borderColor: black, borderWidth: 0.6});
    for (const sign of [-1, 1]) page.drawLine({
      start: point(-0.9, sign * 0.52), end: point(2, -sign * 0.65), thickness: 0.75, color: black,
    });
  }
  rect(mm(5), mm(190.1), mm(5.4), mm(3.8), white);
  scissors(7.5, 0);
  rect(mm(60.1), mm(273), mm(3.8), mm(5.4), white);
  scissors(62, 83.5, true);
  ink(5, 5, 'Empfangsschein', 11, {bold: true});
  ink(67, 5, 'Zahlteil', 11, {bold: true});
  const streetLine = [d.street, d.building].filter(Boolean).join(' ');
  const placeLine = d.postcode + ' ' + d.city;
  const label = (x, y, value, receipt) => ink(x, y, value, receipt ? 6 : 8, {bold: true});
  const detail = (x, y, values, receipt) => {
    const size = receipt ? 8 : 10;
    const lines = values.flatMap(value => wrap(value, fonts.regular, size, mm(receipt ? 51 : 86)));
    for (const [i, value] of lines.entries()) ink(x, y + i * (receipt ? 3.15 : 3.85), value, size);
  };
  for (const [x, receipt] of [[5, true], [118, false]]) {
    const y = receipt ? 13 : 5;
    label(x, y, 'Konto / Zahlbar an', receipt);
    detail(x, y + (receipt ? 2.7 : 3.5), [printIban, business, address, location], receipt);
    if (!receipt) {
      label(x, 27, 'Zusätzliche Informationen', false);
      detail(x, 30.5, [paymentNote(d, demo)], false);
    }
    const debtorY = receipt ? 33 : 40;
    label(x, debtorY, 'Zahlbar durch', receipt);
    detail(x, debtorY + (receipt ? 2.7 : 3.5), [d.name, streetLine, placeLine], receipt);
  }
  for (const [x, y, receipt] of [[5, 68, true], [67, 70, false]]) {
    label(x, y, 'Währung', receipt);
    label(x + 15, y, 'Betrag', receipt);
    detail(x, y + 3.2, ['CHF'], receipt);
    detail(x + 15, y + 3.2, [paymentAmount(d, demo)], receipt);
  }
  ink(57, 92, 'Annahmestelle', 6, {align: 'right', bold: true});

  const matrix = QRCode.create(paymentPayload(d, demo), {errorCorrectionLevel: 'M'}).modules;
  const x = mm(67), top = mm(209), side = mm(46), unit = side / matrix.size;
  // Draw contiguous dark runs with no gaps between modules.
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size;) {
      if (!matrix.get(row, col)) { col += 1; continue; }
      const start = col;
      while (col < matrix.size && matrix.get(row, col)) col += 1;
      rect(x + start * unit, top + row * unit, (col - start) * unit, unit);
    }
  }
  const centerX = x + side / 2, centerY = top + side / 2;
  rect(centerX - mm(3.5), centerY - mm(3.5), mm(7), mm(7), white);
  rect(centerX - mm(3.15), centerY - mm(3.15), mm(6.3), mm(6.3));
  rect(centerX - mm(2.0), centerY - mm(0.6), mm(4.0), mm(1.2), white);
  rect(centerX - mm(0.6), centerY - mm(2.0), mm(1.2), mm(4.0), white);
}

function demoMark(text) {
  text('MUSTER · NICHT VERSENDEN ODER BEZAHLEN', width / 2, 18, 10, {
    align: 'center', bold: true, color: rgb(0.65, 0.13, 0.08),
  });
}

export async function createDocuments(d, {demo = false} = {}) {
  const voucher = await document('Gutschein ' + d.voucher_no, d.issued_on);
  const v = draw(voucher.pdf.addPage([width, height]), voucher.regular, voucher.bold);
  const fondue = await voucher.pdf.embedJpg(fondueJpg);
  const center = (value, top, size, extra = {}) => v.text(value, width / 2, top, size, {align: 'center', ...extra});
  v.image(fondue, width / 2 - 86, 50, 172, 172);
  v.text('NO. ' + d.voucher_no, width - 58, 50, 10, {align: 'right'});
  center('Gutschein', 233, 64);
  center('Im Wert von', 351, 24);
  center('CHF ' + amount(d), 395, 26);
  center('Einlösbar im Fonduehüsli auf dem', 461, 19);
  center('Lindenhof in Bülach', 493, 19);
  if (d.note) {
    const size = 14, font = voucher.regular;
    const lines = wrap(d.note, dedicationFont(font), size, width - 130);
    const icons = new Map();
    for (const [index, line] of lines.entries()) {
      const runs = dedicationRuns(line);
      let x = (width - runs.reduce((total, run) => total + runWidth(run, font, size), 0)) / 2;
      const top = 540 + index * 18;
      for (const run of runs) {
        if (run.emoji) {
          if (!icons.has(run.emoji)) icons.set(run.emoji, await voucher.pdf.embedPng(dedicationEmoji[run.emoji]));
          v.image(icons.get(run.emoji), x + 0.5, top + 0.5, size, size);
        } else v.text(run.text, x, top, size);
        x += runWidth(run, font, size);
      }
    }
  }
  center('Bülach, ' + formatDate(d.issued_on, true), 655, 18);
  center(business + ', ' + address + ', ' + location, 712, 15);
  center('Fonduehüsli Bülach | Lindenhof | 8180 Bülach | www.fonduehuesli.ch | info@soo-event.ch | 078 825 86 54', 797, 9, {fit: width - 66});
  if (demo) demoMark(v.text);

  const invoice = await document('Rechnung ' + d.invoice_no, d.issued_on);
  const page = invoice.pdf.addPage([width, height]);
  const i = draw(page, invoice.regular, invoice.bold);
  const logo = await invoice.pdf.embedPng(companyPng);
  i.image(logo, 55, 44, 92, 69);
  i.text(business, 55, 126, 11, {bold: true});
  i.text(address, 55, 141);
  i.text(location, 55, 155);
  [d.name, [d.street, d.building].filter(Boolean).join(' '), d.postcode + ' ' + d.city, 'Schweiz']
    .forEach((line, n) => i.text(line, 310, 127 + n * 14, 11, {fit: 230}));
  i.text('Rechnung ' + d.invoice_no, 55, 203, 13, {bold: true});
  i.line(55, 225, 540);
  i.text('Gutschein Fonduehüsli', 55, 231, 13, {bold: true});
  i.line(55, 253, 540);
  i.text('Datum', 55, 261);
  i.text(formatDate(d.issued_on), 150, 261);
  i.text('Zahlbar bis', 310, 261);
  i.text(formatDate(d.due_on), 397, 261);
  i.line(55, 281, 540);
  i.text('Guten Tag', 55, 302);
  i.text('Wir erlauben uns, Ihnen wie folgt in Rechnung zu stellen.', 55, 317);
  const right = {align: 'right'};
  for (const [label, x, options] of [['Pos.', 55, {}], ['Beschreibung', 105, {}], ['Menge', 336, right], ['Einzelpreis', 434, right], ['Preis in CHF', 540, right]]) {
    i.text(label, x, 352, 10, {bold: true, ...options});
  }
  i.line(55, 370, 540);
  i.text('1', 55, 379);
  i.text('Gutschein ' + d.voucher_no, 105, 379);
  i.text('1.00 Stk', 336, 379, 10, right);
  i.text(amount(d), 434, 379, 10, right);
  i.text(amount(d), 540, 379, 10, right);
  i.line(55, 414, 540);
  for (const [label, value, top, bold] of [['Total', amount(d), 421, true], ['Zzgl. MWST 0.00%', '0.00', 441, false], ['Betrag inkl. MWST', amount(d), 462, true]]) {
    i.text(label, 105, top, 10, {bold});
    i.text(value, 540, top, 10, {...right, bold});
  }
  i.line(55, 457, 540);
  i.line(55, 479, 540);
  i.line(55, 481, 540);
  i.text('Bei Fragen stehen wir Ihnen gerne zur Verfügung.', 55, 500);
  i.text('Freundliche Grüsse', 55, 518);
  for (const [line, y] of [
    ['Telefon +41 79 484 46 84  |  Raiffeisen  |  BIC RAIFCH22XXX  |  www.soo-event.ch', 791],
    ['IBAN ' + printIban + '  |  ' + business + '  |  MWST-Nr. CHE-397.799.288', 805],
  ]) i.text(line, width / 2, y, 8, {align: 'center'});
  if (demo) demoMark(i.text);

  const slip = invoice.pdf.addPage([width, height]);
  qrSlip(d, slip, invoice, demo);
  if (demo) demoMark(draw(slip, invoice.regular, invoice.bold).text);
  return {voucher: await voucher.pdf.saveAsBase64(), invoice: await invoice.pdf.saveAsBase64()};
}
