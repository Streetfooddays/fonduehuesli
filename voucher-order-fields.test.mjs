import {test} from 'node:test';
import assert from 'node:assert/strict';
import {voucherOrderFields} from './public/voucher-order-fields.mjs';

test('reads multiline voucher orders and retains the personal dedication', () => {
  const body = 'ÜBERMITTELTE INFORMATIONEN:\n\nName\nAnna Muster\n\nPlZ/Ort\n8153 Rümlang\n\n'
    + 'Anzahl Gutscheine:\n1\n\nIch bestelle einen Gutschein im Wert von\n80\n\n'
    + 'Kommentar\nFür mein liebes Mami ❤️\n\nIch freue mich auf den Abend mit dir 🥰\n\n[https://tracking.example.invalid]';
  assert.deepEqual(voucherOrderFields(body), {
    amount: '80.00', note: 'Für mein liebes Mami ❤️\n\nIch freue mich auf den Abend mit dir 🥰',
    postcode: '8153', city: 'Rümlang', comment: '',
  });
});

test('keeps fulfilment instructions out of the printable dedication', () => {
  const logistics = 'Guten Abend\n\nich brauche den Gutschein bis spätestens Mittwoch, besten Dank :)';
  assert.deepEqual(voucherOrderFields('Betrag: CHF 1’250,50\nPLZ: 8180\nOrt: Bülach\nKommentar:\n' + logistics), {
    amount: '1250.50', note: '', postcode: '8180', city: 'Bülach', comment: logistics,
  });
  assert.equal(voucherOrderFields('Widmung: Gerne einen schönen Abend!\nKommentar: Bitte senden').note,
    'Gerne einen schönen Abend!');
});

test('leaves unspecified and ambiguous fields empty', () => {
  assert.deepEqual(voucherOrderFields('Anzahl Gutscheine: 2\nKommentar:\n\n[https://tracking.example.invalid]'), {
    amount: '', note: '', postcode: '', city: '', comment: '',
  });
  assert.equal(voucherOrderFields('Betrag: 80 oder 100\nPLZ: 12').amount, '');
  assert.equal(voucherOrderFields('Gutscheinwert: CHF 80.–').amount, '80.00');
});
