// Patang Go: bank statement ki lines ko website ke pass orders se milana.
//
// Qaida (owner ka): kam az kam 2 cheezein milein: raqam + koi ek ID/number.
// Sirf naam kabhi kaafi nahi.
//  - TID/Ref line mein mile + raqam mile        -> khud manzoor
//  - number (jis se pay kiya) + raqam + tareekh (2 din) aur sirf ek hi
//    order/line aisi ho                          -> khud manzoor
//  - raqam kam ho magar ID/number mile           -> "underpaid" list
//  - baqi sab                                    -> "Check" list
//
// Ye file browser (admin.html) aur Node (tests) dono mein chalti hai.

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Sirf harf aur hindse, bade harf. */
export function normId(s) {
  return String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Phone number ke aakhri 10 hindse (0300... aur 92300... dono ek). */
export function phoneKey(s) {
  const d = String(s ?? '').replace(/[^0-9]/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}

/** Line mein maujood raqamein (1,234.00 / 1234 / Rs.499). */
export function amountsIn(text) {
  const out = new Set();
  const re = /(?<![0-9A-Za-z])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?![0-9])/g;
  for (const m of String(text).matchAll(re)) {
    const whole = Number(m[1].replace(/,/g, ''));
    const frac = m[2] ? Number(m[2]) : 0;
    // Sirf poore rupay (pass ki qeemat paison mein nahi hoti).
    if (frac === 0 && whole > 0 && whole <= 1000000) out.add(whole);
  }
  return [...out];
}

/** Line mein tareekhein, "YYYY-MM-DD" ki shakal mein. */
export function datesIn(text) {
  const out = new Set();
  const t = String(text);
  const pad = (n) => String(n).padStart(2, '0');
  const add = (y, m, d) => {
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2020 && y <= 2100) {
      out.add(`${y}-${pad(m)}-${pad(d)}`);
    }
  };
  for (const m of t.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    add(+m[1], +m[2], +m[3]);
  }
  for (const m of t.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)) {
    add(+m[3], +m[2], +m[1]); // Pakistan: din/mahina/saal
  }
  for (const m of t.matchAll(/\b(\d{1,2})[- ]?([A-Za-z]{3})[A-Za-z]*[- ,]*(\d{2,4})\b/g)) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon) add(+m[3], mon, +m[1]);
  }
  return [...out];
}

function dayDiff(a, b) {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
}

/**
 * Statement ki lines (string ya {text}) aur pending orders milao.
 *
 * order: {id, total, paidAmount, payerRef, payerPhone, paidOn: 'YYYY-MM-DD'}
 * usedRefs: pehle manzoor ho chuke orders ke Ref (dobara istemal na hon).
 * usedLines: pehle manzoor orders ki statement lines (dobara na milein).
 *
 * Wapas: {approve: [{order, line}], underpaid: [{order, line, paid}],
 *         check: [{order, reason}]}
 */
export function matchStatement(rawLines, orders,
    { usedRefs = [], usedLines = [] } = {}) {
  const old = new Set(usedLines.map(normId));
  const lines = rawLines
    .map((l) => (typeof l === 'string' ? l : l.text ?? ''))
    .map((text, i) => ({
      i,
      text,
      ids: normId(text),
      digits: String(text).replace(/[^0-9]/g, ''),
      amounts: amountsIn(text),
      dates: datesIn(text),
    }))
    .filter((l) => l.text.trim().length > 0 && !old.has(l.ids));
  const used = new Set(usedRefs.map(normId).filter((r) => r.length >= 6));

  // Har order ke liye: kaun si lines ID se, kaun si number se milti hain.
  const cands = orders.map((o) => {
    const ref = normId(o.payerRef);
    const phone = phoneKey(o.payerPhone);
    const byRef = ref.length >= 6 ? lines.filter((l) => l.ids.includes(ref)) : [];
    const byPhone = phone
      ? lines.filter((l) => l.digits.includes(phone) &&
          (!o.paidOn || l.dates.length === 0 ||
           l.dates.some((d) => dayDiff(d, o.paidOn) <= 2)))
      : [];
    return { o, ref, phone, byRef, byPhone };
  });

  // Ek line do orders ko nahi mil sakti: jo line ek se zyada orders ki
  // dawedaar ho, wo sab Check mein.
  const claims = new Map();
  for (const c of cands) {
    for (const l of new Set([...c.byRef, ...c.byPhone])) {
      claims.set(l.i, (claims.get(l.i) ?? 0) + 1);
    }
  }

  const approve = [], underpaid = [], check = [];
  const taken = new Set();
  for (const c of cands) {
    const { o } = c;
    const total = Number(o.total) || 0;
    const reason = (r) => check.push({ order: o, reason: r });
    if (c.ref && used.has(c.ref)) {
      reason('This Ref/TID was already used for another order.');
      continue;
    }
    // ID wali lines pehle; warna number wali (sirf ek ho to).
    let pool = c.byRef, how = 'ref';
    if (pool.length === 0) {
      pool = c.byPhone;
      how = 'phone';
    }
    if (pool.length === 0) {
      reason(c.ref || c.phone
          ? 'No statement line has this Ref/TID or number yet.'
          : 'Buyer gave no Ref/TID or number. Check by hand.');
      continue;
    }
    if (pool.some((l) => (claims.get(l.i) ?? 0) > 1)) {
      reason('Another order also matches the same statement line.');
      continue;
    }
    if (how === 'phone' && pool.length > 1) {
      reason('More than one payment from this number. Check by hand.');
      continue;
    }
    const full = pool.find((l) => l.amounts.includes(total) && !taken.has(l.i));
    if (full) {
      taken.add(full.i);
      approve.push({ order: o, line: full.text });
      continue;
    }
    // Kam raqam: buyer ki batai raqam total se kam aur line mein maujood.
    const paid = Number(o.paidAmount) || 0;
    const low = paid > 0 && paid < total
      ? pool.find((l) => !taken.has(l.i) && l.amounts.includes(paid))
      : undefined;
    if (low) {
      taken.add(low.i);
      underpaid.push({ order: o, line: low.text, paid });
      continue;
    }
    reason('The Ref/TID or number matches, but the amount does not.');
  }
  return { approve, underpaid, check };
}

/** Kam raqam wale ke liye WhatsApp paigham (copy/paste). */
export function underpaidMessage({ code, paid, total, passLine }) {
  const left = total - paid;
  return `Salam! Patang Go here. For order ${code} (${passLine}) the price is ` +
    `Rs ${total.toLocaleString('en-PK')}, but we received Rs ` +
    `${paid.toLocaleString('en-PK')}. Please send the remaining Rs ` +
    `${left.toLocaleString('en-PK')} to the same Raast ID, or reply ` +
    `"refund" and we will return your Rs ${paid.toLocaleString('en-PK')}.`;
}

/** WhatsApp link (Pakistan number). */
export function whatsappLink(number, text) {
  let d = String(number ?? '').replace(/[^0-9]/g, '');
  if (d.startsWith('0')) d = '92' + d.slice(1);
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

/** Order code: "PG" + 8 harf/hindse (galti wale 0/O/1/I nahi). */
export function newOrderCode(random = Math.random) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'PG';
  for (let i = 0; i < 8; i++) s += abc[Math.floor(random() * abc.length)];
  return s;
}

/** Basant ke din (1-3) se pass ka waqt, Pakistan time (UTC+5). */
export function passWindow(fromDay, days, start = Date.UTC(2027, 2, 12)) {
  const PKT = 5 * 3600000;
  const from = new Date(start + (fromDay - 1) * 86400000 - PKT);
  const until = new Date(start + (fromDay - 1 + days) * 86400000 - PKT);
  return { from, until };
}

/** Gmail ki list: har line/comma par ek; chhote harf; dohraye hue nahi. */
export function parseEmails(text) {
  const seen = new Set();
  const good = [], bad = [];
  for (const raw of String(text).split(/[\s,;]+/)) {
    const e = raw.trim().toLowerCase();
    if (!e) continue;
    if (!/^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(e)) {
      bad.push(raw.trim());
    } else if (!seen.has(e)) {
      seen.add(e);
      good.push(e);
    }
  }
  return { good, bad };
}
