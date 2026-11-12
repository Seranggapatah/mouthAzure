// Mulut Rive yang berbicara: teks -> suara (Web Speech API) + viseme (view model Rive).
(function () {
  "use strict";

  const V = window.Visemes;
  const N = 22;                 // viseme 0..21
  const LEAD = 0.05;            // mulut mendahului suara (detik)
  const TAU = 0.04;             // kehalusan perpindahan antar bentuk mulut (detik)

  const $ = (id) => document.getElementById(id);
  const ui = {
    canvas: $("mouth"), text: $("text"), speak: $("speak"), stop: $("stop"),
    voice: $("voice"), rate: $("rate"), rateOut: $("rateOut"),
    pitch: $("pitch"), pitchOut: $("pitchOut"), mute: $("mute"),
    status: $("status"), viseme: $("viseme"), samples: $("samples"),
  };

  // ---- Rive -----------------------------------------------------------------

  let talking = null;           // properti boolean isTalking
  let weights = null;           // properti number "0".."21"

  function rivBuffer() {
    const bin = atob(window.RIV_BASE64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function fitCanvas(r) {
    const size = Math.round(ui.canvas.clientWidth * (window.devicePixelRatio || 1));
    if (ui.canvas.width !== size) {
      ui.canvas.width = size;
      ui.canvas.height = size;
      r.resizeDrawingSurfaceToCanvas();
    }
  }

  const riveInstance = new rive.Rive({
    buffer: rivBuffer(),
    canvas: ui.canvas,
    artboard: "Main",
    stateMachine: "State Machine 1",
    autoplay: true,
    autoBind: true,
    layout: new rive.Layout({ fit: rive.Fit.Contain }),
    onLoad: () => {
      const vmi = riveInstance.viewModelInstance;
      talking = vmi && vmi.boolean("isTalking");
      weights = vmi ? Array.from({ length: N }, (_, i) => vmi.number(String(i))) : null;
      if (!talking || !weights || weights.some((w) => !w)) {
        setStatus("View model rig tidak ditemukan di file .riv.", true);
        return;
      }
      fitCanvas(riveInstance);
      window.addEventListener("resize", () => fitCanvas(riveInstance));
      ui.speak.disabled = false;
      setStatus("Siap. Ketik teks lalu tekan Bicara.");
    },
    onLoadError: () => setStatus("Gagal memuat file Rive.", true),
  });

  // ---- pemutaran viseme -------------------------------------------------------

  const mix = new Float64Array(N);   // bobot ternormalisasi, jumlahnya 1
  let play = null;                   // { timeline, clock, speed, startedAt, wordIdx, synced, free }
  let lastFrame = 0;
  let shown = -1;

  function writeWeights() {
    // BlendStateDirect menerapkan animasi berurutan (tiap animasi me-lerp hasil
    // sebelumnya), jadi bobot ternormalisasi n diubah ke m_i = n_i / (n_0+..+n_i)
    // supaya hasil akhirnya tepat sum(n_i * pose_i).
    let acc = 0;
    for (let i = 0; i < N; i++) {
      acc += mix[i];
      weights[i].value = acc > 1e-6 ? (mix[i] / acc) * 100 : 0;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!play || !weights) return;

    play.clock += dt * play.speed;
    if (play.synced) {
      // suara memberi tahu batas tiap kata: jangan mendahului kata berikutnya
      const next = play.timeline.words[play.wordIdx + 1];
      play.clock = Math.min(play.clock, next ? next.t0 : play.timeline.total);
    }
    if (play.free && play.clock >= play.timeline.total + 0.1) return finish();

    const target = V.visemeAt(play.timeline, play.clock + LEAD);
    const k = 1 - Math.exp(-dt / TAU);
    for (let i = 0; i < N; i++) mix[i] += ((i === target ? 1 : 0) - mix[i]) * k;
    writeWeights();

    if (target !== shown) {
      shown = target;
      ui.viseme.textContent = `viseme ${target} · ${V.LABELS[target]}`;
    }
  }
  requestAnimationFrame(frame);

  function begin(timeline, free) {
    mix.fill(0);
    mix[0] = 1;
    writeWeights();
    talking.value = true;
    play = { timeline, clock: 0, speed: 1, startedAt: performance.now(), wordIdx: -1, synced: false, free };
    ui.stop.disabled = false;
  }

  function finish(message) {
    if (!play) return;
    play = null;
    shown = -1;
    talking.value = false;
    ui.stop.disabled = true;
    ui.viseme.textContent = "viseme 0 · diam";
    setStatus(message || "Selesai.");
  }

  // Event "boundary" dari mesin suara: kata di charIndex baru saja mulai diucapkan.
  function onBoundary(e) {
    if (!play || (e.name && e.name !== "word")) return;
    const words = play.timeline.words;
    let idx = -1;
    for (let i = 0; i < words.length && words[i].charIndex <= e.charIndex; i++) idx = i;
    if (idx < 0) return;

    const elapsed = (performance.now() - play.startedAt) / 1000;
    const at = words[idx].t0;
    if (at > 0.4 && elapsed > 0.4) {
      // sesuaikan kecepatan perkiraan dengan kecepatan suara yang sebenarnya
      const measured = Math.min(2, Math.max(0.5, at / elapsed));
      play.speed += (measured - play.speed) * 0.5;
    }
    play.clock = at;
    play.wordIdx = idx;
    play.synced = true;
  }

  // ---- suara ----------------------------------------------------------------

  const synth = window.speechSynthesis;
  let voices = [];
  let current = null;           // utterance yang sedang aktif

  function loadVoices() {
    if (!synth) return;
    const list = synth.getVoices();
    if (!list.length) return;
    const rank = (v) => (v.lang.startsWith("id") ? 0 : v.lang.startsWith("en") ? 1 : 2);
    voices = list.slice().sort((a, b) => rank(a) - rank(b) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
    const keep = ui.voice.value;
    ui.voice.innerHTML = "";
    voices.forEach((v, i) => {
      const o = document.createElement("option");
      o.value = v.voiceURI;
      o.textContent = `${v.name} (${v.lang})`;
      ui.voice.appendChild(o);
      if (v.voiceURI === keep) ui.voice.selectedIndex = i;
    });
  }

  function selectedVoice() {
    return voices.find((v) => v.voiceURI === ui.voice.value) || null;
  }

  function stop() {
    current = null;
    if (synth) synth.cancel();
    finish("Dihentikan.");
  }

  function speak() {
    const text = ui.text.value.trim();
    if (!text || !weights) return;
    stop();

    const voice = selectedVoice();
    const rate = parseFloat(ui.rate.value);
    const lang = voice && voice.lang.startsWith("en") ? "en" : "id";
    const timeline = V.buildTimeline(text, { lang, rate });
    if (!timeline.segments.length) return setStatus("Tidak ada yang bisa diucapkan.", true);

    if (ui.mute.checked || !synth) {
      begin(timeline, true);
      return setStatus(synth ? "Berbicara tanpa suara…" : "Browser ini tidak punya suara; mulut bergerak tanpa suara.");
    }

    const u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "id-ID";
    u.rate = rate;
    u.pitch = parseFloat(ui.pitch.value);
    const mine = () => current === u;
    u.onstart = () => { if (mine()) { begin(timeline, false); setStatus("Berbicara…"); } };
    u.onboundary = (e) => { if (mine()) onBoundary(e); };
    u.onend = () => { if (mine()) { current = null; finish(); } };
    u.onerror = (e) => {
      if (!mine()) return;
      current = null;
      finish(`Suara gagal diputar (${e.error}).`);
    };
    current = u;
    setStatus("Menyiapkan suara…");
    synth.speak(u);
  }

  // ---- UI -------------------------------------------------------------------

  function setStatus(message, isError) {
    ui.status.textContent = message;
    ui.status.classList.toggle("error", !!isError);
  }

  const fmt = (x) => parseFloat(x).toFixed(1).replace(".", ",");
  ui.rate.addEventListener("input", () => { ui.rateOut.textContent = fmt(ui.rate.value) + "×"; });
  ui.pitch.addEventListener("input", () => { ui.pitchOut.textContent = fmt(ui.pitch.value); });
  ui.speak.addEventListener("click", speak);
  ui.stop.addEventListener("click", stop);
  ui.text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); speak(); }
  });
  ui.samples.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    ui.text.value = b.dataset.text;
    speak();
  });

  if (synth) {
    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    window.addEventListener("pagehide", () => synth.cancel());
  } else {
    ui.voice.disabled = true;
  }

  window.mouthApp = { speak, stop, get state() { return play; } };
})();
