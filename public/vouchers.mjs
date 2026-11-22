import {guest, escapeHTML as e} from './core.mjs';

const currency = new Intl.NumberFormat('de-CH', {style: 'currency', currency: 'CHF'});
const amount = cents => currency.format(cents / 100);
const date = iso => iso.split('-').reverse().join('.');
const status = row => row.sent_at ? 'Versendet' : row.first_send_attempt ? 'Versand offen' : 'Bereit zum Versand';

function pdfLink(content) {
  const bytes = Uint8Array.from(atob(content), char => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
}

export function voucherContact(booking, mail) {
  const saved = booking ? guest(booking) : {};
  const draft = mail?.draft?.data || {};
  const contact = mail?.draft?.is_reply && booking ? saved : {...saved,
    ...Object.fromEntries(Object.entries(draft).filter(([, value]) => typeof value === 'string' && value.trim())),
  };
  const street = String(contact.street || '').trim();
  const address = street.match(/^(.+?)\s+(\d+[\p{L}]?(?:[-/]\d+[\p{L}]?)?)$/u);
  const sender = String(mail?.sender || '').trim().match(/(?:<|^)([^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+)>?$/)?.[1];
  const person = [contact.first, contact.last].filter(Boolean).join(' ').trim();
  return {
    name: contact.company || person,
    email: contact.email || sender || '',
    street: address?.[1] || street,
    building: address?.[2] || '',
    postcode: contact.zip || '',
    city: contact.city || '',
  };
}

export function openVoucherDialog({req, booking, mail}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'voucher-dialog';
  dialog.setAttribute('aria-label', 'Gutschein erstellen');
  dialog.innerHTML = '<div class="dialog-head"><h2>Gutschein erstellen</h2><button type="button" class="quiet" aria-label="Schliessen">✕</button></div><div data-voucher-body></div>';
  document.body.append(dialog);
  const dispose = renderVouchers(dialog.querySelector('[data-voucher-body]'), {
    req, initialFields: voucherContact(booking, mail), inDialog: true,
  });
  function close() {
    dispose();
    if (dialog.open) dialog.close();
    dialog.remove();
  }
  dialog.querySelector('.dialog-head button').onclick = close;
  dialog.addEventListener('close', close, {once: true});
  dialog.showModal();
  return close;
}

export function renderVouchers(root, {req, initialFields = {}, inDialog = false}) {
  root.innerHTML = `<section class="card voucher-workspace">
    ${inDialog ? '' : '<h2>Gutscheine</h2>'}
    <form data-voucher-form>
      <fieldset class="voucher-fields">
        <legend>Rechnung und Gutschein erstellen</legend>
        <label>Rechnungsname<input name="name" maxlength="70" autocomplete="billing name" required></label>
        <label>E-Mail für den Versand<input name="email" type="email" maxlength="254" required></label>
        <label>Strasse<input name="street" maxlength="70" required></label>
        <label>Hausnummer<input name="building" maxlength="16"></label>
        <label>PLZ<input name="postcode" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="billing postal-code" required></label>
        <label>Ort<input name="city" maxlength="35" autocomplete="billing address-level2" required></label>
        <label>Betrag in CHF<input name="amount" inputmode="decimal" placeholder="100.00" required></label>
        <label class="voucher-wide">Persönliche Widmung (optional)<textarea name="note" rows="3" maxlength="320"></textarea></label>
      </fieldset>
      <div class="actions"><button type="submit">PDFs erstellen und ansehen</button></div>
    </form>
    <p data-voucher-message role="status" aria-live="polite" hidden></p>
    <section data-voucher-preview hidden></section>
    ${inDialog ? '' : `<section class="voucher-history">
      <h3>Zuletzt erstellte Gutscheine</h3>
      <div data-voucher-history aria-live="polite"></div>
    </section>`}
  </section>`;
  const form = root.querySelector('[data-voucher-form]');
  for (const [name, value] of Object.entries(initialFields)) {
    const field = form.querySelector(`[name="${name}"]`);
    if (field) field.value = value;
  }
  const message = root.querySelector('[data-voucher-message]');
  const preview = root.querySelector('[data-voucher-preview]');
  const history = root.querySelector('[data-voucher-history]');
  const fields = form.querySelector('fieldset');
  const submit = form.querySelector('button');
  const request = body => req('/functions/v1/voucher-documents', {method: 'POST', body});
  let urls = [];
  let busy = false;
  let disposed = false;
  let pending;
  let opened;

  function showMessage(text, error = false) {
    message.textContent = text;
    message.hidden = !text;
    message.className = error ? 'hint error' : 'hint';
  }

  function releaseLinks() {
    urls.forEach(url => URL.revokeObjectURL(url));
    urls = [];
  }

  function showPreview(row, scroll = true) {
    if (disposed) return;
    releaseLinks();
    opened = row;
    const documents = [
      {title: 'Gutschein', no: row.voucher_no, url: pdfLink(row.documents.voucher)},
      {title: 'Rechnung', no: row.invoice_no, url: pdfLink(row.documents.invoice)},
    ];
    urls = documents.map(doc => doc.url);
    preview.hidden = false;
    preview.innerHTML = `<div class="voucher-review-heading">
      <div><h3 tabindex="-1">Vorschau · ${e(row.voucher_no)}</h3>
      <p>${e(amount(row.amount_cents))} · ${e(row.name)}<br>Versand an <strong>${e(row.email)}</strong></p></div>
      <button type="button" class="quiet small" data-voucher-close>Vorschau schliessen</button>
    </div>
    <div class="voucher-pdfs">${documents.map(doc => `<section>
      <h4>${doc.title}</h4>
      <iframe title="${doc.title} ${e(doc.no)}" src="${doc.url}"></iframe>
      <a href="${doc.url}" target="_blank" rel="noopener">PDF öffnen</a>
      <a href="${doc.url}" download="${doc.title}-${e(doc.no)}.pdf">Herunterladen</a>
    </section>`).join('')}</div>
    <div class="voucher-send actions">
      <span data-voucher-send-state>${e(status(row))}</span>
      <button type="button" data-voucher-send ${row.sent_at ? 'disabled' : ''}>Versand</button>
    </div>`;
    preview.querySelector('[data-voucher-close]').onclick = () => {
      if (busy) return;
      releaseLinks();
      opened = null;
      preview.replaceChildren();
      preview.hidden = true;
    };
    const send = preview.querySelector('[data-voucher-send]');
    send.onclick = () => run(async () => {
      const result = await request({action: 'send', id: row.id});
      if (!result.sent_at) throw new Error('Der Versand wurde noch nicht bestätigt.');
      row.sent_at = result.sent_at;
      if (disposed) return;
      preview.querySelector('[data-voucher-send-state]').textContent = 'Versendet an ' + row.email;
      showMessage('Gutschein und Rechnung wurden zum Versand angenommen.');
      await refreshHistory();
    });
    if (busy) send.disabled = true;
    if (scroll) preview.querySelector('h3').focus();
  }

  async function refreshHistory() {
    if (!history || disposed) return;
    try {
      const rows = await request({action: 'list'});
      if (disposed) return;
      if (!rows.length) {
        history.textContent = 'Hier erscheinen die erstellten Gutscheine.';
        return;
      }
      history.innerHTML = rows.map(row => `<div class="voucher-history-row">
        <div><strong>${e(row.voucher_no)} · ${e(row.name)}</strong>
        <span>${e(date(row.issued_on))} · ${e(amount(row.amount_cents))} · ${e(status(row))}</span></div>
        <button type="button" class="secondary small" data-voucher-open="${e(row.id)}" ${busy ? 'disabled' : ''}>Ansehen</button>
      </div>`).join('');
      history.querySelectorAll('[data-voucher-open]').forEach(button => {
        button.onclick = () => run(async () => showPreview(await request({action: 'preview', id: button.dataset.voucherOpen})));
      });
    } catch (error) {
      if (!disposed) history.textContent = error.message;
    }
  }

  function disable(on) {
    busy = on;
    submit.disabled = on;
    fields.disabled = on;
    history?.querySelectorAll('button').forEach(button => {button.disabled = on;});
    const send = preview.querySelector('[data-voucher-send]');
    if (send) send.disabled = on || !!opened?.sent_at;
  }

  async function run(action) {
    if (busy || disposed) return;
    disable(true);
    showMessage('Wird verarbeitet …');
    try {
      await action();
      if (!disposed && message.textContent === 'Wird verarbeitet …') showMessage('');
    } catch (error) {
      if (!disposed) showMessage(error.message, true);
    } finally {
      if (!disposed) disable(false);
    }
  }

  form.onsubmit = event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const fingerprint = JSON.stringify(values);
    if (pending?.fingerprint !== fingerprint) pending = {id: crypto.randomUUID(), fingerprint};
    const id = pending.id;
    void run(async () => {
      const row = await request({action: 'create', id, fields: values});
      if (disposed) return;
      pending = null;
      form.reset();
      showPreview(row);
      await refreshHistory();
    });
  };
  void refreshHistory();
  return () => {disposed = true; releaseLinks();};
}
