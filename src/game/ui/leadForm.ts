/**
 * Lead-capture overlay. One-step opt-in: name, email and/or WhatsApp, and a
 * segment selector. Renders on top of the canvas. It does NOT own persistence —
 * it calls the hub's shared LeadCaptureService (which writes the lead, POSTs the
 * CRM webhook, and handles consent/PDPL). The form just collects and validates.
 *
 * Used in two situations:
 *  - to SAVE a score to a leaderboard, or
 *  - to CLAIM the "interview fast-track" catch (reward pre-attached).
 */
import type { HubIdentity, LeadCaptureInput, Segment } from '@hub/types';
import { palette, fonts, copy } from '../../brand/theme';

export interface LeadFormResult {
  name: string;
  email?: string;
  whatsapp?: string;
  segment: Segment;
  office?: string;
  consent: boolean;
}

export interface LeadFormOptions {
  identity: HubIdentity;
  /** Heading reflects the reason — saving a score vs claiming the fast-track. */
  heading: string;
  subheading: string;
  ctaLabel: string;
  /** Prefill from a prior opt-in in the same session. */
  prefill?: Partial<LeadFormResult>;
  onSubmit(result: LeadFormResult): void;
  onCancel(): void;
}

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'new', label: 'New to broking' },
  { value: 'returning', label: 'Returning to it' },
  { value: 'experienced', label: 'Experienced broker' },
  { value: 'relocating', label: 'Relocating broker' },
];

export function openLeadForm(host: HTMLElement, opts: LeadFormOptions): () => void {
  const overlay = el('div', 'bh-lead-overlay');
  Object.assign(overlay.style, {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(31,52,63,0.55)',
    backdropFilter: 'blur(2px)',
    zIndex: '20',
    padding: '16px',
  });

  const card = el('form', 'bh-lead-card');
  Object.assign(card.style, {
    background: palette.mist,
    color: palette.slate,
    width: '100%',
    maxWidth: '380px',
    borderRadius: '14px',
    padding: '22px',
    fontFamily: fonts.body,
    boxShadow: '0 18px 50px rgba(21,36,44,0.35)',
  });

  card.appendChild(heading(opts.heading));
  card.appendChild(sub(opts.subheading));

  const name = field(card, 'Your name', 'text', 'name', opts.prefill?.name);
  const email = field(card, 'Email', 'email', 'email', opts.prefill?.email);
  const whatsapp = field(card, 'WhatsApp (optional if email given)', 'tel', 'whatsapp', opts.prefill?.whatsapp);

  card.appendChild(label('Which describes you?'));
  const segSelect = document.createElement('select');
  styleInput(segSelect);
  for (const s of SEGMENTS) {
    const o = document.createElement('option');
    o.value = s.value;
    o.textContent = s.label;
    if (opts.prefill?.segment === s.value) o.selected = true;
    segSelect.appendChild(o);
  }
  card.appendChild(segSelect);

  // Consent.
  const consentWrap = el('label', 'bh-consent');
  Object.assign(consentWrap.style, {
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
    margin: '14px 0',
    fontSize: '13px',
    lineHeight: '1.4',
  });
  const consent = document.createElement('input');
  consent.type = 'checkbox';
  consent.required = true;
  const consentText = el('span');
  consentText.textContent =
    'I agree to betterhomes contacting me about broker opportunities. I can ask for my data to be deleted at any time.';
  consentWrap.append(consent, consentText);
  card.appendChild(consentWrap);

  const error = el('div', 'bh-error');
  Object.assign(error.style, { color: palette.salmon, fontSize: '13px', minHeight: '18px' });
  card.appendChild(error);

  // Salmon diamond CTA (CTA-only colour, diamond shape).
  const cta = diamondButton(opts.ctaLabel);
  card.appendChild(cta);

  const cancel = el('button', 'bh-cancel') as HTMLButtonElement;
  cancel.type = 'button';
  cancel.textContent = 'Maybe later';
  Object.assign(cancel.style, {
    display: 'block',
    margin: '12px auto 0',
    background: 'transparent',
    border: 'none',
    color: palette.denim,
    fontFamily: fonts.body,
    fontSize: '14px',
    cursor: 'pointer',
  });
  card.appendChild(cancel);

  const footer = el('div');
  footer.textContent = copy.campaign;
  Object.assign(footer.style, {
    textAlign: 'center',
    marginTop: '14px',
    fontFamily: fonts.headline,
    fontSize: '13px',
    color: palette.denim,
  });
  card.appendChild(footer);

  const close = (): void => {
    overlay.remove();
  };

  card.addEventListener('submit', (e) => {
    e.preventDefault();
    error.textContent = '';
    const nameVal = name.value.trim();
    const emailVal = email.value.trim();
    const waVal = whatsapp.value.trim();
    if (!nameVal) return fail(error, 'Please add your name.');
    if (!emailVal && !waVal) return fail(error, 'Add an email or a WhatsApp number so we can reach you.');
    if (emailVal && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailVal)) return fail(error, 'That email looks off.');
    if (!consent.checked) return fail(error, 'We need your consent to get in touch.');

    const result: LeadFormResult = {
      name: nameVal,
      segment: segSelect.value as Segment,
      consent: true,
      ...(emailVal ? { email: emailVal } : {}),
      ...(waVal ? { whatsapp: waVal } : {}),
    };
    opts.onSubmit(result);
    close();
  });

  cancel.addEventListener('click', () => {
    opts.onCancel();
    close();
  });

  overlay.appendChild(card);
  host.appendChild(overlay);
  name.focus();
  return close;
}

/** Build the CRM-bound capture input from form result + run context. */
export function toCaptureInput(
  identity: HubIdentity,
  form: LeadFormResult,
  ctx: { source: string; referralCode?: string; claimedCatchId?: string },
): LeadCaptureInput {
  return {
    identity,
    name: form.name,
    segment: form.segment,
    consent: form.consent,
    source: ctx.source,
    ...(form.email ? { email: form.email } : {}),
    ...(form.whatsapp ? { whatsapp: form.whatsapp } : {}),
    ...(form.office ? { office: form.office } : {}),
    ...(ctx.referralCode ? { referralCode: ctx.referralCode } : {}),
    ...(ctx.claimedCatchId ? { claimedCatchId: ctx.claimedCatchId } : {}),
  };
}

// --- tiny DOM helpers --------------------------------------------------------

function fail(error: HTMLElement, msg: string): void {
  error.textContent = msg;
}

function el(tag: string, cls?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  return node;
}

function heading(text: string): HTMLElement {
  const h = el('h2');
  h.textContent = text;
  Object.assign(h.style, {
    fontFamily: fonts.headline,
    fontSize: '22px',
    margin: '0 0 6px',
    fontWeight: '600',
  });
  return h;
}

function sub(text: string): HTMLElement {
  const p = el('p');
  p.textContent = text;
  Object.assign(p.style, { fontSize: '14px', margin: '0 0 16px', color: palette.denim });
  return p;
}

function label(text: string): HTMLElement {
  const l = el('label');
  l.textContent = text;
  Object.assign(l.style, { display: 'block', fontSize: '13px', margin: '12px 0 6px', fontWeight: '600' });
  return l;
}

function field(
  card: HTMLElement,
  labelText: string,
  type: string,
  name: string,
  prefill?: string,
): HTMLInputElement {
  card.appendChild(label(labelText));
  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  input.autocomplete = name === 'name' ? 'name' : name === 'email' ? 'email' : 'tel';
  if (prefill) input.value = prefill;
  styleInput(input);
  card.appendChild(input);
  return input;
}

function styleInput(input: HTMLElement): void {
  Object.assign(input.style, {
    width: '100%',
    boxSizing: 'border-box',
    padding: '11px 12px',
    borderRadius: '9px',
    border: `1px solid ${palette.powder}`,
    background: '#fff',
    color: palette.slate,
    fontFamily: fonts.body,
    fontSize: '15px',
  });
}

/** Salmon diamond CTA — the only place salmon is used. */
function diamondButton(text: string): HTMLButtonElement {
  const wrap = document.createElement('button');
  wrap.type = 'submit';
  Object.assign(wrap.style, {
    position: 'relative',
    display: 'block',
    width: '100%',
    marginTop: '18px',
    padding: '16px 18px',
    border: 'none',
    cursor: 'pointer',
    background: 'transparent',
  });
  const diamond = el('span');
  Object.assign(diamond.style, {
    position: 'absolute',
    inset: '0',
    background: palette.salmon,
    transform: 'skewX(-8deg)',
    borderRadius: '8px',
    boxShadow: '0 8px 20px rgba(255,120,122,0.4)',
  });
  const lbl = el('span');
  lbl.textContent = text;
  Object.assign(lbl.style, {
    position: 'relative',
    color: '#fff',
    fontFamily: fonts.headline,
    fontWeight: '600',
    fontSize: '16px',
  });
  wrap.append(diamond, lbl);
  return wrap;
}
