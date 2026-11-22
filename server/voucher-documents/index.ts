import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createDocuments, validateVoucher} from './documents.mjs';

const cors = {
  'Access-Control-Allow-Origin': 'https://fonduehuesli-reservationen.onrender.com',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Cache-Control': 'no-store',
};
const answer = (data: unknown, status = 200) => Response.json(data, {status, headers: cors});
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: {persistSession: false, autoRefreshToken: false},
});
const table = () => admin.from('voucher_documents');
const summaryFields = 'id,voucher_no,invoice_no,issued_on,due_on,name,email,amount_cents,sent_at,first_send_attempt';
const from = 'Fonduehüsli Bülach <reservation@fonduehuesli.ch>';

async function checked(request: any) {
  const {data, error} = await request;
  if (error) {
    console.error('Voucher database operation failed', error.code);
    throw new Error('Die Gutscheindaten konnten nicht verarbeitet werden.');
  }
  return data;
}

async function lookup(id: string) {
  return checked(table().select('*').eq('id', id).maybeSingle());
}

async function ensureDocuments(row: any) {
  if (row.documents) return row;
  const documents = await createDocuments(row);
  const saved = await checked(table().update({documents}).eq('id', row.id).is('documents', null).select().maybeSingle());
  return saved || await lookup(row.id);
}

function preview(row: any) {
  const summary = Object.fromEntries(summaryFields.split(',').map(field => [field, row[field]]));
  return {...summary, documents: row.documents};
}

async function sentMessage(row: any) {
  if (!row.resend_id || !/^[0-9a-f-]{36}$/i.test(row.resend_id)) return null;
  try {
    const credentials = await checked(admin.rpc('mail_credentials'));
    if (!credentials?.api_key) return null;
    const response = await fetch('https://api.resend.com/emails/' + row.resend_id, {
      headers: {Authorization: 'Bearer ' + credentials.api_key},
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return null;
    const mail = await response.json();
    return {subject: mail.subject, text: mail.text, last_event: mail.last_event};
  } catch {
    return null;
  }
}

async function finishDelivery(id: string, resendId: string | null = null) {
  return answer(await checked(admin.rpc('finish_voucher_delivery', {p_id: id, p_resend_id: resendId})));
}

async function sendVoucher(row: any) {
  if (row.sent_at) return finishDelivery(row.id);
  if (row.mail_id) {
    const mail = await checked(admin.from('mail_inbox').select('voucher_sent_at').eq('id', row.mail_id).maybeSingle());
    if (mail?.voucher_sent_at) return answer({error: 'Für diese Anfrage wurde bereits ein Gutschein versendet.'}, 409);
  }
  const {documents} = await ensureDocuments(row);
  const credentials = await checked(admin.rpc('mail_credentials'));
  if (!credentials?.enabled || !credentials?.api_key) return answer({error: 'Der E-Mail-Versand ist noch nicht verbunden.'}, 409);
  const started = await checked(table().update({first_send_attempt: new Date().toISOString()})
    .eq('id', row.id).is('first_send_attempt', null).select('first_send_attempt,sent_at').maybeSingle());
  const delivery = started || await checked(table().select('first_send_attempt,sent_at').eq('id', row.id).single());
  if (delivery.sent_at) return finishDelivery(row.id);
  // Resend retains idempotency keys for 24 hours. Leave a margin before expiry.
  if (Date.now() - Date.parse(delivery.first_send_attempt) >= 23 * 60 * 60 * 1000) {
    return answer({error: 'Der frühere Versandstatus ist offen. Bitte im Versandprotokoll prüfen, ob die E-Mail angekommen ist.'}, 409);
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + credentials.api_key,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'fonduehuesli-voucher/' + row.id,
    },
    body: JSON.stringify({
      from, to: [row.email], reply_to: 'reservation@fonduehuesli.ch',
      subject: 'Dein Fonduehüsli-Gutschein ' + row.voucher_no,
      text: 'Guten Tag\n\nIm Anhang findest du deinen Gutschein für das Fonduehüsli Bülach und die Rechnung.\n\nViel Freude beim Verschenken und bis bald auf dem Lindenhof!\n\nFreundliche Grüsse\nFonduehüsli Bülach',
      attachments: [
        {filename: 'Gutschein-' + row.voucher_no + '.pdf', content: documents.voucher},
        {filename: 'Rechnung-' + row.invoice_no + '.pdf', content: documents.invoice},
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    console.error('Voucher mail provider response', response.status);
    const problem = response.status === 401 || response.status === 403
      ? 'Der Maildienst hat den Versand abgelehnt. Bitte die Mailanbindung prüfen.'
      : 'Der Maildienst hat den Versand noch nicht bestätigt. Bitte erneut versuchen.';
    return answer({error: problem}, 502);
  }
  const result = await response.json();
  if (typeof result.id !== 'string' || !result.id) return answer({error: 'Der Maildienst hat keine Versandbestätigung geliefert.'}, 502);
  return finishDelivery(row.id, result.id);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {headers: cors});
  if (req.method !== 'POST') return answer({error: 'Methode nicht erlaubt.'}, 405);
  try {
    const jwt = req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!jwt) return answer({error: 'Bitte anmelden.'}, 401);
    const {data: {user}, error} = await admin.auth.getUser(jwt);
    if (error || !user?.email_confirmed_at) return answer({error: 'Bitte erneut anmelden.'}, 401);
    const member = await checked(admin.from('team_members').select('active').eq('user_id', user.id).maybeSingle());
    if (!member?.active) return answer({error: 'Kein Teamzugriff.'}, 403);

    const raw = await req.text();
    if (raw.length > 6000) return answer({error: 'Die Eingabe ist zu lang.'}, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return answer({error: 'Eingabe prüfen.'}, 400); }
    if (!body || typeof body !== 'object') return answer({error: 'Eingabe prüfen.'}, 400);

    if (body.action === 'sent') {
      const offset = body.offset ?? 0;
      if (!Number.isSafeInteger(offset) || offset < 0) return answer({error: 'Seitenangabe prüfen.'}, 400);
      const pageSize = 25;
      const records = await checked(table().select(summaryFields).not('sent_at', 'is', null)
        .order('sent_at', {ascending: false}).order('id', {ascending: false}).range(offset, offset + pageSize));
      return answer({items: records.slice(0, pageSize), next_offset: records.length > pageSize ? offset + pageSize : null});
    }
    if (body.action === 'list') {
      const list = await checked(table().select(summaryFields)
        .order('issued_on', {ascending: false}).order('serial', {ascending: false}).limit(100));
      return answer(list);
    }
    if (!['create', 'preview', 'send'].includes(body.action) ||
        typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) {
      return answer({error: 'Aktion prüfen.'}, 400);
    }
    if (body.action === 'create') {
      if (!body.fields || typeof body.fields !== 'object') return answer({error: 'Eingabe prüfen.'}, 400);
      let fields;
      try { fields = await validateVoucher(body.fields); }
      catch (err) { return answer({error: (err as Error).message}, 400); }
      const mailId = body.mail_id ?? null;
      if (mailId !== null && (typeof mailId !== 'string' || !mailId.trim() || mailId.length > 200 || /[\u0000-\u001f\u007f]/.test(mailId))) {
        return answer({error: 'Mailanfrage prüfen.'}, 400);
      }
      if (mailId !== null) {
        const mail = await checked(admin.from('mail_inbox').select('voucher_sent_at').eq('id', mailId).maybeSingle());
        if (!mail) return answer({error: 'Mailanfrage nicht gefunden.'}, 404);
        if (mail.voucher_sent_at) return answer({error: 'Für diese Anfrage wurde bereits ein Gutschein versendet.'}, 409);
      }
      const row = await checked(admin.rpc('issue_voucher', {p_id: body.id, p_user: user.id, p_data: fields, p_mail_id: mailId}));
      return answer(preview(await ensureDocuments(row)));
    }
    const row = await lookup(body.id);
    if (!row) return answer({error: 'Gutschein nicht gefunden.'}, 404);
    if (body.action === 'send') return await sendVoucher(row);
    const saved = await ensureDocuments(row);
    return answer(body.include_message === true && saved.sent_at
      ? {...preview(saved), mail: await sentMessage(saved)}
      : preview(saved));
  } catch (err) {
    console.error('Voucher operation failed', (err as Error).name);
    return answer({error: 'Die Aktion konnte nicht abgeschlossen werden. Bitte erneut versuchen.'}, 500);
  }
});
