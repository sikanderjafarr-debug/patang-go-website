// Firebase (website): wahi project jo app ka hai. Ye chaabiyan public
// pehchaan hain (password nahi); hifazat firestore.rules karte hain.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const app = initializeApp({
  apiKey: 'AIzaSyB88zfnabsnLYhRMT1YKTqzHUm5NT602dA',
  appId: '1:334910418950:web:e3cbbf69c97edeecb81387',
  messagingSenderId: '334910418950',
  projectId: 'patang-go',
  authDomain: 'patang-go.firebaseapp.com',
  storageBucket: 'patang-go.firebasestorage.app',
});
export const db = getFirestore(app);

export const TIERS = {
  standard: { name: 'Standard', perks: '5 pecha challenges a day' },
  premium: { name: 'Premium', perks: 'Unlimited challenges + your photo all over Lahore' },
};

export function rs(n) {
  return 'Rs ' + Number(n || 0).toLocaleString('en-PK');
}

export function marchDay(fromDay) {
  return `${11 + fromDay} March`;
}

/** "5 × Standard, 2 days (12–13 March)" */
export function passLine(o) {
  const days = o.days === 1 ? '1 day' : `${o.days} days`;
  const last = o.fromDay + o.days - 1;
  const dates = o.days === 1 ? marchDay(o.fromDay)
    : `${11 + o.fromDay}–${11 + last} March`;
  const n = (o.emails || []).length;
  return `${n} × ${TIERS[o.tier]?.name ?? o.tier}, ${days} (${dates})`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
