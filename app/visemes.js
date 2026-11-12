// Teks -> urutan viseme (id 0..21, sama dengan viseme Azure Speech yang dipakai rig).
// Tidak bergantung pada DOM, jadi bisa dipakai di browser maupun Node.
(function (root) {
  "use strict";

  const LABELS = [
    "diam", "ae, schwa", "a", "ao", "e", "er", "i, y", "u, w", "o", "au", "oi",
    "ai", "h", "r", "l", "s, z", "sy, c, j", "th", "f, v", "d, t, n", "k, g, ng",
    "p, b, m",
  ];

  // Lama dasar tiap bunyi (detik, pada kecepatan 1).
  const VOWEL = 0.095, CONS = 0.065, SHORT = 0.045, LONG = 0.14;
  const VOWEL_IDS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

  const CONSONANTS = {
    b: 21, p: 21, m: 21, f: 18, v: 18, d: 19, t: 19, n: 19, l: 14, r: 13,
    s: 15, z: 15, j: 16, k: 20, g: 20, q: 20, h: 12, w: 7, y: 6,
  };

  // Aturan dicocokkan dari yang terpanjang. Nilai: daftar [viseme, durasi].
  const RULES = {
    id: {
      ng: [[20, CONS]], ny: [[19, CONS]], sy: [[16, CONS]], kh: [[20, CONS]],
      a: [[2, VOWEL]], e: [[4, VOWEL * 0.8]], i: [[6, VOWEL]],
      o: [[8, VOWEL]], u: [[7, VOWEL]],
      c: [[16, CONS]], x: [[20, SHORT], [15, CONS]],
      w: [[7, SHORT]], y: [[6, SHORT]],
    },
    en: {
      tch: [[16, CONS]], sch: [[15, CONS], [20, CONS]], igh: [[11, LONG]],
      eau: [[8, VOWEL]],
      th: [[17, CONS]], sh: [[16, CONS]], ch: [[16, CONS]], ph: [[18, CONS]],
      wh: [[7, SHORT]], ck: [[20, CONS]], ng: [[20, CONS]],
      qu: [[20, SHORT], [7, SHORT]], gh: [],
      ee: [[6, LONG]], ea: [[6, LONG]], ie: [[6, LONG]], oo: [[7, LONG]],
      ou: [[9, LONG]], ow: [[9, LONG]], oy: [[10, LONG]], oi: [[10, LONG]],
      ai: [[4, LONG]], ay: [[4, LONG]], ei: [[4, LONG]], ey: [[4, LONG]],
      au: [[3, LONG]], aw: [[3, LONG]], oa: [[8, LONG]],
      ue: [[7, LONG]], ew: [[7, LONG]],
      er: [[5, VOWEL]], ir: [[5, VOWEL]], ur: [[5, VOWEL]],
      ar: [[2, VOWEL], [13, SHORT]], or: [[3, VOWEL], [13, SHORT]],
      a: [[1, VOWEL]], e: [[4, VOWEL]], i: [[6, VOWEL]], o: [[8, VOWEL]],
      u: [[1, VOWEL]], y: [[6, VOWEL]],
      c: [[20, CONS]], x: [[20, SHORT], [15, CONS]], w: [[7, SHORT]],
    },
  };

  // ---- angka -> kata ------------------------------------------------------

  const ID_ONES = ["nol", "satu", "dua", "tiga", "empat", "lima", "enam",
    "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

  function numberId(n) {
    const rest = (r) => (r ? " " + numberId(r) : "");
    if (n < 12) return ID_ONES[n];
    if (n < 20) return numberId(n - 10) + " belas";
    if (n < 100) return numberId(Math.floor(n / 10)) + " puluh" + rest(n % 10);
    if (n < 200) return "seratus" + rest(n - 100);
    if (n < 1000) return numberId(Math.floor(n / 100)) + " ratus" + rest(n % 100);
    if (n < 2000) return "seribu" + rest(n - 1000);
    if (n < 1e6) return numberId(Math.floor(n / 1e3)) + " ribu" + rest(n % 1e3);
    if (n < 1e9) return numberId(Math.floor(n / 1e6)) + " juta" + rest(n % 1e6);
    return numberId(Math.floor(n / 1e9)) + " miliar" + rest(n % 1e9);
  }

  const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven",
    "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
    "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty",
    "seventy", "eighty", "ninety"];

  function numberEn(n) {
    const rest = (r) => (r ? " " + numberEn(r) : "");
    if (n < 20) return EN_ONES[n];
    if (n < 100) return EN_TENS[Math.floor(n / 10)] + rest(n % 10);
    if (n < 1000) return EN_ONES[Math.floor(n / 100)] + " hundred" + rest(n % 100);
    if (n < 1e6) return numberEn(Math.floor(n / 1e3)) + " thousand" + rest(n % 1e3);
    if (n < 1e9) return numberEn(Math.floor(n / 1e6)) + " million" + rest(n % 1e6);
    return numberEn(Math.floor(n / 1e9)) + " billion" + rest(n % 1e9);
  }

  function spellNumber(digits, lang) {
    const say = lang === "en" ? numberEn : numberId;
    if (digits.length > 12 || (digits.length > 1 && digits[0] === "0")) {
      return digits.split("").map((d) => say(+d)).join(" ");
    }
    return say(parseInt(digits, 10));
  }

  // ---- kata -> bunyi ------------------------------------------------------

  function wordToPhones(word, lang) {
    const rules = RULES[lang] || RULES.id;
    let w = word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    w = w.replace(/\d+/g, (d) => " " + spellNumber(d, lang) + " ");

    const out = [];
    const push = (v, d) => {
      const last = out[out.length - 1];
      if (last && last.v === v) last.d += d * 0.6;   // bunyi kembar: perpanjang saja
      else out.push({ v, d });
    };

    for (const part of w.split(/\s+/)) {
      for (let i = 0; i < part.length;) {
        const ch = part[i];
        let hit = null, len = 1;
        for (len = 3; len >= 1; len--) {
          hit = rules[part.substr(i, len)];
          if (hit && part.length - i >= len) break;
          hit = null;
        }
        if (!hit) len = 1;

        if (lang === "en") {
          const prev = part[i - 1], next = part[i + 1];
          // "e" bisu di akhir kata: make, time
          if (ch === "e" && i === part.length - 1 && part.length > 3 && !/[aeiou]/.test(prev)) {
            i += 1; continue;
          }
          if (ch === "c" && len === 1 && /[eiy]/.test(next || "")) hit = [[15, CONS]];
          if (ch === "y" && len === 1 && i === 0) hit = [[6, SHORT]];
        }

        if (hit) hit.forEach(([v, d]) => push(v, d));
        else if (CONSONANTS[ch] !== undefined) {
          // h/k di akhir kata nyaris tak terlihat
          const soft = (ch === "h" || ch === "k") && i === part.length - 1;
          // bibir harus sempat benar-benar menutup untuk p/b/m
          const shut = CONSONANTS[ch] === 21;
          push(CONSONANTS[ch], soft ? SHORT : shut ? CONS * 1.3 : CONS);
        } else if (/\p{L}/u.test(ch)) push(1, VOWEL);   // aksara lain: buka-tutup umum
        i += len;
      }
    }
    return out;
  }

  // ---- teks -> timeline ---------------------------------------------------

  function pauseFor(gap) {
    if (/[.!?…\n]/.test(gap)) return 0.45;
    if (/[,;:—–()]/.test(gap)) return 0.28;
    return 0;
  }

  /**
   * @returns {{segments: {t0:number,t1:number,v:number}[],
   *            words: {charIndex:number,text:string,t0:number,t1:number}[],
   *            total: number}}
   * Waktu dalam detik untuk kecepatan `rate` (1 = normal).
   */
  function buildTimeline(text, opts) {
    const lang = (opts && opts.lang) || "id";
    const rate = (opts && opts.rate) || 1;
    const segments = [], words = [];
    const re = /[\p{L}\p{N}]+/gu;
    let t = 0.06, prevEnd = 0, m;

    while ((m = re.exec(text))) {
      if (words.length) {
        const pause = pauseFor(text.slice(prevEnd, m.index)) / rate;
        if (pause) { segments.push({ t0: t, t1: t + pause, v: 0 }); t += pause; }
      }
      const phones = wordToPhones(m[0], lang);
      const word = { charIndex: m.index, text: m[0], t0: t, t1: t };
      for (const p of phones) {
        const d = p.d / rate;
        const last = segments[segments.length - 1];
        if (last && last.v === p.v && last.t1 === t) {
          t += d * 0.6;            // sambung dengan bunyi yang sama di kata sebelumnya
          last.t1 = t;
        } else {
          segments.push({ t0: t, t1: t + d, v: p.v });
          t += d;
        }
      }
      word.t1 = t;
      words.push(word);
      prevEnd = m.index + m[0].length;
    }
    return { segments, words, total: t };
  }

  /** Viseme pada waktu t (0 = diam bila di luar timeline). */
  function visemeAt(timeline, t) {
    const s = timeline.segments;
    let lo = 0, hi = s.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (t < s[mid].t0) hi = mid - 1;
      else if (t >= s[mid].t1) lo = mid + 1;
      else return s[mid].v;
    }
    return 0;
  }

  const api = { LABELS, VOWEL_IDS, wordToPhones, buildTimeline, visemeAt, spellNumber };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Visemes = api;
})(typeof self !== "undefined" ? self : this);
