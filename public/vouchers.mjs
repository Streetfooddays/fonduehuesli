import {guest, escapeHTML as e} from './core.mjs';

const currency = new Intl.NumberFormat('de-CH', {style: 'currency', currency: 'CHF'});
const amount = cents => currency.format(cents / 100);
const date = iso => iso.split('-').reverse().join('.');
const deliveryLabels = {
  sent: 'Versendet', delivered: 'Zugestellt', opened: 'Zugestellt · geöffnet', clicked: 'Zugestellt · Link geöffnet',
  bounced: 'Unzustellbar', complained: 'Als Spam gemeldet', delivery_delayed: 'Zustellung verzögert',
  failed: 'Versand fehlgeschlagen', suppressed: 'Vom Maildienst unterdrückt',
};
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

export function openVoucherDialog({req, booking, mail, orderFields, onMailArchived, sentVoucher}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'voucher-dialog';
  const title = sentVoucher ? 'Versendete Gutscheinmail' : 'Gutschein erstellen';
  dialog.setAttribute('aria-label', title);
  dialog.innerHTML = '<div class="dialog-head"><h2>' + title + '</h2><button type="button" class="quiet" aria-label="Schliessen">✕</button></div><div data-voucher-body></div>';
  document.body.append(dialog);
  const {comment = '', ...order} = orderFields || {};
  const initialFields = {...voucherContact(booking, mail), ...Object.fromEntries(Object.entries(order).filter(([, value]) => value))};
  const dispose = renderVouchers(dialog.querySelector('[data-voucher-body]'), {
    req, initialFields, inDialog: true, mailId: mail?.id, onMailArchived, comment, sentVoucher, onClose: close,
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

export function renderVouchers(root, {req, initialFields = {}, inDialog = false, mailId = null, onMailArchived, comment = '', sentVoucher, onClose}) {
  root.innerHTML = `<section class="card voucher-workspace">
    ${inDialog ? '' : '<h2>Gutscheine</h2>'}
    ${comment ? `<aside class="hint voucher-order-comment"><strong>Kommentar aus der Bestellung</strong><div>${e(comment)}</div></aside>` : ''}
    <form data-voucher-form ${sentVoucher ? 'hidden' : ''}>
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
    <section data-voucher-receipt aria-label="Versandbestätigung" hidden></section>
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
  const receipt = root.querySelector('[data-voucher-receipt]');
  const orderComment = root.querySelector('.voucher-order-comment');
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

  function returnToForm() {
    receipt.replaceChildren();
    receipt.hidden = true;
    form.hidden = false;
    if (orderComment) orderComment.hidden = false;
    form.querySelector('input').focus();
  }

  function showReceipt(row, archived = false) {
    if (disposed) return;
    releaseLinks();
    preview.replaceChildren();
    preview.hidden = true;
    form.hidden = true;
    if (orderComment) orderComment.hidden = true;
    receipt.hidden = false;
    receipt.innerHTML = `<h3 tabindex="-1">Gutscheinversand bestätigt</h3>
      <p>Der Maildienst hat Gutschein und Rechnung zum Versand angenommen.</p>
      <dl>
        <div><dt>Empfänger</dt><dd>${e(row.email)}</dd></div>
        <div><dt>Versandzeit</dt><dd><time datetime="${e(row.sent_at)}">${e(sentTime.format(new Date(row.sent_at)))}</time></dd></div>
        <div><dt>Gutschein</dt><dd>${e(row.voucher_no)} · ${e(amount(row.amount_cents))}</dd></div>
        <div><dt>Rechnung</dt><dd>${e(row.invoice_no)}</dd></div>
      </dl>
      ${archived ? '<p>Die Mailanfrage wurde als erledigt abgelegt.</p>' : ''}
      <div class="actions">
        <button type="button" class="secondary" data-receipt-pdfs>PDFs ansehen</button>
        <button type="button" data-receipt-done>Schliessen</button>
      </div>`;
    receipt.querySelector('[data-receipt-pdfs]').onclick = () => run(async () => {
      const documents = row.documents ? row : await request({action: 'preview', id: row.id});
      showPreview(documents, true, () => showReceipt(row, archived));
    });
    receipt.querySelector('[data-receipt-done]').onclick = () => {
      if (busy) return;
      if (inDialog) onClose?.();
      else returnToForm();
    };
    receipt.querySelector('h3').focus();
  }

  function showPreview(row, scroll = true, backToReceipt) {
    if (disposed) return;
    releaseLinks();
    receipt.hidden = true;
    opened = row;
    const documents = [
      {title: 'Gutschein', no: row.voucher_no, url: pdfLink(row.documents.voucher)},
      {title: 'Rechnung', no: row.invoice_no, url: pdfLink(row.documents.invoice)},
    ];
    urls = documents.map(doc => doc.url);
    preview.hidden = false;
    preview.innerHTML = `${sentVoucher ? (row.mail ? `<section class="voucher-sent-message">
      <h3>${e(row.mail.subject || 'Dein Fonduehüsli-Gutschein ' + row.voucher_no)}</h3>
      <p>${e(deliveryLabels[row.mail.last_event] || 'Versand erfasst')}</p>
      <div>${e(row.mail.text || '')}</div>
    </section>` : '<p class="muted">Der E-Mail-Text ist momentan nicht abrufbar.</p>') : ''}
    <div class="voucher-review-heading">
      <div><h3 tabindex="-1">Vorschau · ${e(row.voucher_no)}</h3>
      <p>${e(amount(row.amount_cents))} · ${e(row.name)}<br>Versand an <strong>${e(row.email)}</strong></p></div>
      ${sentVoucher ? '' : `<button type="button" class="quiet small" data-voucher-close>${backToReceipt ? 'Zur Versandbestätigung' : 'Vorschau schliessen'}</button>`}
    </div>
    <div class="voucher-pdfs">${documents.map(doc => `<section>
      <h4>${doc.title}</h4>
      <iframe title="${doc.title} ${e(doc.no)}" src="${doc.url}"></iframe>
      <a href="${doc.url}" target="_blank" rel="noopener">PDF öffnen</a>
      <a href="${doc.url}" download="${doc.title}-${e(doc.no)}.pdf">Herunterladen</a>
    </section>`).join('')}</div>
    ${sentVoucher || row.sent_at ? '' : `<div class="voucher-send actions">
      <span data-voucher-send-state>${e(status(row))}</span>
      <button type="button" data-voucher-send>Versand</button>
    </div>`}`;
    if (sentVoucher) return;
    preview.querySelector('[data-voucher-close]').onclick = () => {
      if (busy) return;
      releaseLinks();
      opened = null;
      preview.replaceChildren();
      preview.hidden = true;
      backToReceipt?.();
    };
    const send = preview.querySelector('[data-voucher-send]');
    if (send) send.onclick = () => run(async () => {
      const result = await request({action: 'send', id: row.id});
      if (!result.sent_at) throw new Error('Der Versand wurde noch nicht bestätigt.');
      row.sent_at = result.sent_at;
      if (result.voucher_sent_at) onMailArchived?.(result);
      if (disposed) return;
      showReceipt(row, !!result.voucher_sent_at);
      await refreshHistory();
    });
    if (busy && send) send.disabled = true;
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
        <button type="button" class="secondary small" data-voucher-open="${e(row.id)}" ${busy ? 'disabled' : ''}>${row.sent_at ? 'Versandbestätigung' : 'Ansehen'}</button>
      </div>`).join('');
      history.querySelectorAll('[data-voucher-open]').forEach(button => {
        const row = rows.find(item => item.id === button.dataset.voucherOpen);
        button.onclick = () => run(async () => {
          if (row.sent_at) showReceipt(row);
          else {
            returnToForm();
            showPreview(await request({action: 'preview', id: row.id}));
          }
        });
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
    receipt.querySelectorAll('button').forEach(button => {button.disabled = on;});
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
      const row = await request({action: 'create', id, fields: values, mail_id: mailId});
      if (disposed) return;
      pending = null;
      form.reset();
      showPreview(row);
      await refreshHistory();
    });
  };
  if (sentVoucher) showPreview(sentVoucher, false);
  else void refreshHistory();
  return () => {disposed = true; releaseLinks();};
}

const sentTime = new Intl.DateTimeFormat('de-CH', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Zurich',
});

export function renderSentVoucherMail(root, {req, onOpen}) {
  root.innerHTML = `<details class="day-notes">
    <summary>Versendete Gutscheinmails</summary>
    <p data-sent-voucher-status role="status"></p>
    <div data-sent-voucher-list></div>
    <button type="button" class="secondary small" data-sent-voucher-more hidden>Weitere anzeigen</button>
  </details>`;
  const details = root.querySelector('details');
  const status = root.querySelector('[data-sent-voucher-status]');
  const list = root.querySelector('[data-sent-voucher-list]');
  const more = root.querySelector('[data-sent-voucher-more]');
  const request = body => req('/functions/v1/voucher-documents', {method: 'POST', body});
  let started = false, pending = false, offset = 0;

  async function loadPage() {
    if (pending || offset === null) return;
    pending = true;
    more.disabled = true;
    status.textContent = 'Gutscheinmails werden geladen …';
    try {
      const page = await request({action: 'sent', offset});
      if (!root.isConnected) return;
      started = true;
      offset = page.next_offset;
      status.textContent = page.items.length || list.childElementCount ? '' : 'Es wurden noch keine Gutscheine versendet.';
      const fragment = document.createDocumentFragment();
      for (const row of page.items) {
        const item = document.createElement('div');
        item.className = 'voucher-history-row';
        item.innerHTML = `<div><strong>Dein Fonduehüsli-Gutschein ${e(row.voucher_no)}</strong>
          <span>${e(sentTime.format(new Date(row.sent_at)))} · ${e(row.email)}</span>
          <span>${e(amount(row.amount_cents))} · Rechnung ${e(row.invoice_no)}</span></div>
          <button type="button" class="secondary small">Mail und PDFs ansehen</button>`;
        const button = item.querySelector('button');
        button.onclick = async () => {
          button.disabled = true;
          try {
            const sentVoucher = await request({action: 'preview', id: row.id, include_message: true});
            if (root.isConnected) onOpen(sentVoucher);
          } catch (err) { status.textContent = err.message; }
          finally { button.disabled = false; }
        };
        fragment.append(item);
      }
      list.append(fragment);
      more.textContent = 'Weitere anzeigen';
      more.hidden = offset === null;
    } catch (err) {
      status.textContent = err.message;
      more.textContent = 'Erneut versuchen';
      more.hidden = false;
    } finally {
      more.disabled = false;
      pending = false;
    }
  }

  details.ontoggle = () => { if (details.open && !started) void loadPage(); };
  more.onclick = () => void loadPage();
}
