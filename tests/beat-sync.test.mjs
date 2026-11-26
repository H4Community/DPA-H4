import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const INDEX_HTML_PATH = path.join(ROOT, "index.html");
const HTML = fs.readFileSync(INDEX_HTML_PATH, "utf8");
const SCRIPT_MATCH = HTML.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(SCRIPT_MATCH, "index.html must contain an inline <script>");
const INLINE_JS = SCRIPT_MATCH[1];

/**
 * Deterministic headless harness executing the REAL inline script from index.html
 * with controllable performance.now(), AudioContext.currentTime, HTMLAudioElement,
 * requestAnimationFrame, and setInterval timers.
 */
function createAppHarness(initialStorage = {}) {
  let perfNowMs = 1000;
  let audioNowSec = 10.0;
  let docHidden = false;
  let nextRafId = 1;
  let nextIntervalId = 1;
  let nextTimeoutId = 1;

  const rafQueue = new Map();
  const intervals = new Map();
  const timeouts = new Map();
  const storage = new Map(Object.entries(initialStorage));
  const docListeners = new Map();

  // Track every Web Audio scheduled node & bus to detect duplicate/stale sounds
  let busCounter = 0;
  const scheduledAudioEvents = [];
  let createdAudioCtx = null;

  class MockGainNode {
    constructor(ctx) {
      this.id = ++busCounter;
      this.ctx = ctx;
      this.connected = false;
      this.mutedAt = null;
      this.gain = {
        value: 1,
        setValueAtTime: (v, t) => {
          this.gain.value = v;
          if (v === 0) this.mutedAt = t;
        },
        exponentialRampToValueAtTime: () => {},
        cancelScheduledValues: () => {},
      };
    }
    connect() { this.connected = true; }
    disconnect() { this.connected = false; }
  }

  class MockScheduledNode {
    constructor(ctx, kind) {
      this.ctx = ctx;
      this.kind = kind;
      this.startedAt = null;
      this.stoppedAt = null;
      this.forceStopped = false;
      this.destBus = null;
      this.frequency = {
        value: 0,
        setValueAtTime: (v) => { this.frequency.value = v; },
        exponentialRampToValueAtTime: () => {},
      };
      this.type = "";
      this.buffer = null;
      this.onended = null;
    }
    connect(dest) {
      // Walk gain/filter chain to find if connected to a bus GainNode
      if (dest instanceof MockGainNode) {
        this.destBus = dest;
      } else if (dest && dest._bus) {
        this.destBus = dest._bus;
      }
      this._target = dest;
    }
    disconnect() {}
    start(when = 0) {
      this.startedAt = when;
      const bus = this._resolveBus();
      const ev = {
        kind: this.kind,
        when,
        bus,
        node: this,
        isLiveAt: (t) => {
          if (this.forceStopped) return false;
          if (bus && (!bus.connected || (bus.mutedAt !== null && bus.mutedAt <= t))) return false;
          return true;
        },
      };
      scheduledAudioEvents.push(ev);
    }
    stop(when) {
      if (when === undefined) {
        this.forceStopped = true;
      } else {
        this.stoppedAt = when;
      }
    }
    _resolveBus() {
      let cur = this._target;
      while (cur) {
        if (cur instanceof MockGainNode && cur.id > 0 && cur._isBus) return cur;
        cur = cur._next;
      }
      return null;
    }
  }

  class MockAudioContext {
    constructor() {
      this.state = "running";
      this.sampleRate = 44100;
      this.destination = { _isDest: true };
      createdAudioCtx = this;
    }
    get currentTime() { return audioNowSec; }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    createGain() {
      const g = new MockGainNode(this);
      const origConnect = g.connect.bind(g);
      g.connect = (dest) => {
        g._next = dest;
        if (dest === this.destination) g._isBus = true;
        origConnect(dest);
      };
      return g;
    }
    createOscillator() { return new MockScheduledNode(this, "osc"); }
    createBuffer(ch, len) {
      const arr = new Float32Array(len);
      return { getChannelData: () => arr };
    }
    createBufferSource() { return new MockScheduledNode(this, "noise"); }
    createBiquadFilter() {
      const f = {
        type: "bandpass",
        frequency: { value: 0 },
        _next: null,
        connect(dest) { this._next = dest; },
      };
      return f;
    }
  }

  let createdAudioEl = null;
  const pendingPlayResolvers = [];
  let deferAudioPlay = false;

  class MockAudioElement {
    constructor() {
      this.preload = "";
      this.volume = 1;
      this.src = "";
      this.currentTime = 0;
      this.paused = true;
      this.readyState = 4;
      this.playbackRate = 1;
      this.preservesPitch = false;
      this.mozPreservesPitch = false;
      this.webkitPreservesPitch = false;
      this._listeners = new Map();
      createdAudioEl = this;
    }
    addEventListener(ev, fn) {
      if (!this._listeners.has(ev)) this._listeners.set(ev, []);
      this._listeners.get(ev).push(fn);
    }
    emit(ev) {
      for (const fn of (this._listeners.get(ev) || [])) fn({ type: ev });
    }
    pause() {
      this.paused = true;
    }
    play() {
      this.paused = false;
      if (deferAudioPlay) {
        return new Promise((resolve, reject) => {
          pendingPlayResolvers.push({ resolve, reject, src: this.src });
        });
      }
      this.emit("play");
      return Promise.resolve();
    }
  }

  function makeElement(id = "", tagName = "DIV", attrs = {}) {
    const classes = new Set();
    const listeners = new Map();
    const attrMap = new Map(Object.entries(attrs));
    const el = {
      id,
      tagName,
      textContent: "",
      innerHTML: "",
      value: "",
      disabled: false,
      hidden: false,
      style: {
        _props: {},
        setProperty(k, v) { this._props[k] = v; },
      },
      classList: {
        add(...c) { c.forEach((x) => classes.add(x)); },
        remove(...c) { c.forEach((x) => classes.delete(x)); },
        toggle(c, force) {
          if (force === undefined) {
            if (classes.has(c)) { classes.delete(c); return false; }
            classes.add(c); return true;
          }
          if (force) classes.add(c); else classes.delete(c);
          return !!force;
        },
        contains(c) { return classes.has(c); },
      },
      setAttribute(k, v) { attrMap.set(k, String(v)); },
      getAttribute(k) { return attrMap.has(k) ? attrMap.get(k) : null; },
      removeAttribute(k) { attrMap.delete(k); },
      addEventListener(ev, fn) {
        if (!listeners.has(ev)) listeners.set(ev, []);
        listeners.get(ev).push(fn);
      },
      click() {
        for (const fn of (listeners.get("click") || [])) fn({ target: el, preventDefault() {} });
      },
      dispatch(ev, extra = {}) {
        for (const fn of (listeners.get(ev) || [])) fn({ target: el, preventDefault() {}, ...extra });
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      appendChild() {},
      pause() {},
      play() { return Promise.resolve(); },
    };
    return el;
  }

  const elementsById = new Map();
  const ids = [
    "groovesGrid", "crewSpeech", "starCount", "resetStarsBtn", "calmMotionBtn",
    "complianceBtn", "compliancePanel", "complianceArrow", "toggleOfflineBtn", "exitOfflineBtn",
    "workshopForm", "formError", "bookingCard", "teacherName", "schoolName", "targetMonth",
    "playerModal", "playerStage", "stageVisual", "stageDancerWrap", "stageEnergyCallout",
    "playerModeLabel", "playerMoveNumber", "playerMoveTitle", "playerMoveDesc", "playerCoachCue",
    "totalTimerDisplay", "switchTimerDisplay", "eightCountBpmLabel", "eightCountCycleLabel",
    "bpmDisplay", "bpmDownBtn", "bpmUpBtn", "tapBpmBtn", "musicBar", "songControlsWrap",
    "songSelect", "nextSongBtn", "musicVolSlider", "musicStatusNote", "upNextBanner",
    "upNextText", "playPauseBtn", "startRandomDpaBtn", "startRandomDpaBtn2", "nextMoveBtn",
    "closeModalBtn", "interval2x8Btn", "interval3x8Btn", "quickDemoBtn", "confettiLayer",
  ];
  for (const id of ids) elementsById.set(id, makeElement(id));

  const beatBoxes = Array.from({ length: 8 }, (_, i) => makeElement(`beat-${i}`, "DIV", { "data-beat": String(i) }));
  const audioModeBtns = ["songs", "beat", "own"].map((m) => makeElement(`mode-${m}`, "BUTTON", { "data-audio-mode": m }));
  const bpmTierBtns = [95, 100, 110, 115].map((t) => makeElement(`tier-${t}`, "BUTTON", { "data-bpm-tier": String(t) }));
  const bodyEl = makeElement("body", "BODY");

  const documentMock = {
    body: bodyEl,
    activeElement: bodyEl,
    get hidden() { return docHidden; },
    getElementById(id) {
      if (!elementsById.has(id)) elementsById.set(id, makeElement(id));
      return elementsById.get(id);
    },
    querySelectorAll(sel) {
      if (sel === ".beat-box") return beatBoxes;
      if (sel === ".audio-mode-btn") return audioModeBtns;
      if (sel === ".bpm-tier-btn") return bpmTierBtns;
      if (sel === ".crew-card-btn") return [];
      if (sel === "video.move-video") return [];
      return [];
    },
    createElement(tag) { return makeElement("", tag.toUpperCase()); },
    addEventListener(ev, fn) {
      if (!docListeners.has(ev)) docListeners.set(ev, []);
      docListeners.get(ev).push(fn);
    },
    emit(ev, payload = {}) {
      for (const fn of (docListeners.get(ev) || [])) fn(payload);
    },
  };

  const windowMock = {
    location: { href: "http://localhost:8080/index.html" },
    AudioContext: MockAudioContext,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };

  const sandbox = {
    window: windowMock,
    document: documentMock,
    Audio: MockAudioElement,
    URL,
    console,
    Math,
    Number,
    String,
    Array,
    Set,
    Map,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => { storage.set(k, String(v)); },
    },
    performance: { now: () => perfNowMs },
    requestAnimationFrame: (fn) => {
      const id = nextRafId++;
      rafQueue.set(id, fn);
      return id;
    },
    cancelAnimationFrame: (id) => { rafQueue.delete(id); },
    setInterval: (fn, ms) => {
      const id = nextIntervalId++;
      intervals.set(id, { fn, ms });
      return id;
    },
    clearInterval: (id) => { intervals.delete(id); },
    setTimeout: (fn, ms) => {
      const id = nextTimeoutId++;
      timeouts.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => { timeouts.delete(id); },
  };
  sandbox.globalThis = sandbox;

  // Run the actual production inline script
  vm.runInNewContext(INLINE_JS, sandbox, { filename: "index.html#script" });

  // Use the real production sync helpers exposed on window.__h4DpaSync
  const syncApi = windowMock.__h4DpaSync;
  assert.ok(syncApi, "index.html must expose window.__h4DpaSync");

  return {
    el: (id) => documentMock.getElementById(id),
    beatBoxes,
    audioModeBtns,
    bpmTierBtns,
    document: documentMock,
    get audio() { return createdAudioEl; },
    get audioCtx() { return createdAudioCtx; },
    SONGS: syncApi.SONGS,
    getSongBeatsElapsed: syncApi.getSongBeatsElapsed,
    getSongPhraseBeatsElapsed: syncApi.getSongPhraseBeatsElapsed,
    getSongTimeForBeat: syncApi.getSongTimeForBeat,
    getSongCountOneBeat: syncApi.getSongCountOneBeat,
    getSongFirstCountOneSec: syncApi.getSongFirstCountOneSec,
    getSyncState: syncApi.getState,
    scheduledAudioEvents,
    pendingPlayResolvers,
    setDeferAudioPlay(flag) { deferAudioPlay = flag; },
    setPerfNow(ms) { perfNowMs = ms; },
    advancePerfNow(ms) { perfNowMs += ms; },
    setAudioNow(sec) { audioNowSec = sec; },
    advanceAudioNow(sec) { audioNowSec += sec; },
    setDocHidden(h) {
      docHidden = h;
      documentMock.emit("visibilitychange");
    },
    stepRaf() {
      const entries = Array.from(rafQueue.entries());
      rafQueue.clear();
      for (const [, fn] of entries) fn(perfNowMs);
    },
    stepSchedulerIntervals() {
      for (const { fn, ms } of Array.from(intervals.values())) {
        if (ms <= 50) fn();
      }
    },
    getActiveBeatNumber() {
      const idx = beatBoxes.findIndex((b) => b.classList.contains("is-active"));
      return idx === -1 ? 0 : idx + 1;
    },
    getMoveTitle() {
      return documentMock.getElementById("playerMoveTitle").textContent;
    },
    async flushMicrotasks() {
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

// =========================================================================
// 1. Metadata & Piecewise Anchor Integrity
// =========================================================================
test("All 24 SONGS have valid files, exactBpm, beatOffsetSec, and monotonic beatAnchors", () => {
  const h = createAppHarness();
  assert.equal(h.SONGS.length, 24);
  for (const song of h.SONGS) {
    assert.ok(fs.existsSync(path.join(ROOT, song.src)), `Missing audio file: ${song.src}`);
    assert.ok(Number.isFinite(song.exactBpm) && song.exactBpm > 80 && song.exactBpm < 140);
    assert.ok(Number.isFinite(song.beatOffsetSec) && song.beatOffsetSec >= 0 && song.beatOffsetSec < 5);
    if (song.countOneBeat !== undefined) {
      assert.ok(
        Number.isInteger(song.countOneBeat) && song.countOneBeat >= 0 && song.countOneBeat % 2 === 0,
        `${song.id} countOneBeat must be an even non-negative integer to keep backbeat snares on 2/4/6/8`
      );
    }
    const c1Beat = h.getSongCountOneBeat(song);
    const c1Sec = h.getSongFirstCountOneSec(song);
    assert.ok(Number.isFinite(c1Sec) && c1Sec >= song.beatOffsetSec - 1e-9, `${song.id} firstCountOneSec must be >= beatOffsetSec`);
    assert.ok(Math.abs(h.getSongBeatsElapsed(song, c1Sec) - c1Beat) < 1e-6, `${song.id} time/beat round-trip at countOneBeat`);
    assert.ok(Math.abs(h.getSongPhraseBeatsElapsed(song, c1Sec)) < 1e-6, `${song.id} phrase beat must be 0 at firstCountOneSec`);
    if (song.beatAnchors) {
      assert.ok(song.beatAnchors.length >= 2);
      assert.equal(song.beatAnchors[0][0], song.beatOffsetSec, `${song.id} anchor 0 time must match beatOffsetSec`);
      assert.equal(song.beatAnchors[0][1], 0, `${song.id} anchor 0 beat must be 0`);
      for (let i = 1; i < song.beatAnchors.length; i++) {
        const dt = song.beatAnchors[i][0] - song.beatAnchors[i - 1][0];
        const db = song.beatAnchors[i][1] - song.beatAnchors[i - 1][1];
        assert.ok(dt > 0, `${song.id} anchor times must increase`);
        assert.ok(db > 0, `${song.id} anchor beats must increase`);
        const segBpm = (60 * db) / dt;
        assert.ok(
          segBpm > song.exactBpm * 0.90 && segBpm < song.exactBpm * 1.10,
          `${song.id} anchor segment ${i} BPM ${segBpm.toFixed(2)} out of bounds around exactBpm ${song.exactBpm}`
        );
      }
      // Verify getSongBeatsElapsed hits every anchor point exactly and has zero discontinuities across anchors
      for (const [t, b] of song.beatAnchors) {
        const computed = h.getSongBeatsElapsed(song, t);
        assert.ok(Math.abs(computed - b) < 1e-9, `${song.id} anchor mismatch at t=${t}: got ${computed}, expected ${b}`);
        const leftVal = h.getSongBeatsElapsed(song, t - 1e-4);
        const rightVal = h.getSongBeatsElapsed(song, t + 1e-4);
        assert.ok(leftVal < computed && computed < rightVal, `${song.id} must be strictly monotonic across anchor t=${t}`);
        assert.ok(rightVal - leftVal < 0.01, `${song.id} discontinuity across anchor t=${t}`);
      }
    }
  }
});

// =========================================================================
// 2. Tier BPM Normalization & Pitch-Preserving Playback Rate
// =========================================================================
test("Selected BPM tier normalizes actual playback BPM via preservesPitch + playbackRate", async () => {
  const h = createAppHarness({ h4_dpa_audio_mode: "songs", h4_dpa_song_id: "100-boom-bap-backpack" });
  h.el("startRandomDpaBtn").click();
  await h.flushMicrotasks();

  // Boom-Bap Backpack is in 100 tier with exactBpm = 92.50 -> normalized to 100 BPM
  assert.equal(h.el("bpmDisplay").textContent, "100 BPM");
  assert.equal(h.audio.preservesPitch, true);
  assert.equal(h.audio.mozPreservesPitch, true);
  assert.equal(h.audio.webkitPreservesPitch, true);
  assert.ok(Math.abs(h.audio.playbackRate - (100 / 92.5)) < 1e-4, `Expected ~1.0811, got ${h.audio.playbackRate}`);

  // Clicking -5 adjusts playback rate to 95 / 92.5 without switching songs
  h.el("bpmDownBtn").click();
  assert.equal(h.el("bpmDisplay").textContent, "95 BPM");
  assert.ok(Math.abs(h.audio.playbackRate - (95 / 92.5)) < 1e-4);
  assert.ok(decodeURI(h.audio.src).includes("Boom-Bap Backpack.mp3"));

  // Clicking the active 100 tier pill resets playback back to normalized 100 BPM
  h.bpmTierBtns[1].click(); // 100 tier
  assert.equal(h.el("bpmDisplay").textContent, "100 BPM");
  assert.ok(Math.abs(h.audio.playbackRate - (100 / 92.5)) < 1e-4);

  // Switching to 115 tier loads Block Party Brass normalized to 115 / exactBpm
  const blockParty = h.SONGS.find((s) => s.id === "115-block-party-brass");
  h.bpmTierBtns[3].click(); // 115 tier
  await h.flushMicrotasks();
  assert.equal(h.el("bpmDisplay").textContent, "115 BPM");
  assert.ok(Math.abs(h.audio.playbackRate - (115 / blockParty.exactBpm)) < 1e-4);
});

// =========================================================================
// 3. Pre-Downbeat Lead-In, Deterministic 1..8 Lock, & Exact Count-1 Move Transitions
// =========================================================================
test("H4 Songs waits cleanly before beatOffsetSec and transitions strictly on Count 1 after 2x8 and 3x8 counts", async () => {
  const h = createAppHarness({ h4_dpa_audio_mode: "songs", h4_dpa_song_id: "100-boom-bap-backpack" });
  h.el("startRandomDpaBtn").click();
  await h.flushMicrotasks();

  const song = h.SONGS.find((s) => s.id === "100-boom-bap-backpack"); // exactBpm 92.50, offset 0.669
  const T = 60 / song.exactBpm;
  const initialMove = h.getMoveTitle();

  // During pre-downbeat lead-in (0.0s .. 0.65s), no beat circle should falsely highlight
  h.audio.currentTime = 0.30;
  h.stepRaf();
  assert.equal(h.getActiveBeatNumber(), 0);
  assert.equal(h.getMoveTitle(), initialMove);

  // Step beat-by-beat from beat 0 through beat 15 (2x8 = 16 beats)
  for (let b = 0; b < 16; b++) {
    h.audio.currentTime = song.beatOffsetSec + (b + 0.05) * T;
    h.stepRaf();
    assert.equal(h.getActiveBeatNumber(), (b % 8) + 1, `Beat ${b} should highlight ${(b % 8) + 1}`);
    assert.equal(h.getMoveTitle(), initialMove, `Move must NOT switch early at beat ${b}`);
  }

  // Beat 16 (Count 1 of bar 3) MUST switch move right on Count 1
  h.audio.currentTime = song.beatOffsetSec + 16.05 * T;
  h.stepRaf();
  const secondMove = h.getMoveTitle();
  assert.equal(h.getActiveBeatNumber(), 1);
  assert.notEqual(secondMove, initialMove, "Move must switch on Beat 16 (Count 1 after 2x8)");

  // Switch to 3x8 Counts mid-move and verify next transition happens on Beat 40 (16 + 24)
  h.el("interval3x8Btn").click();
  for (let b = 17; b < 40; b++) {
    h.audio.currentTime = song.beatOffsetSec + (b + 0.05) * T;
    h.stepRaf();
    assert.equal(h.getActiveBeatNumber(), (b % 8) + 1);
    assert.equal(h.getMoveTitle(), secondMove, `3x8 move must NOT switch early at beat ${b}`);
  }
  h.audio.currentTime = song.beatOffsetSec + 40.05 * T;
  h.stepRaf();
  assert.equal(h.getActiveBeatNumber(), 1);
  assert.notEqual(h.getMoveTitle(), secondMove, "3x8 move must switch strictly on Beat 40 (Count 1)");
});

// =========================================================================
// 4. Manual Move Switching Never Resets Musical Phase
// =========================================================================
test("Manual Switch Move Now preserves live 1..8 musical phase and aligns next auto-switch to Count 1", async () => {
  const h = createAppHarness({ h4_dpa_audio_mode: "songs", h4_dpa_song_id: "115-arcade-bounce" });
  h.el("startRandomDpaBtn").click();
  await h.flushMicrotasks();

  const song = h.SONGS.find((s) => s.id === "115-arcade-bounce");
  const c1 = h.getSongCountOneBeat(song);
  const c1Sec = h.getSongFirstCountOneSec(song);
  const T = 60 / song.exactBpm;

  // Advance to phrase Beat 5 (phrase beat index 4 -> raw beat c1 + 4)
  for (let b = 0; b <= 4; b++) {
    h.audio.currentTime = c1Sec + (b + 0.05) * T;
    h.stepRaf();
  }
  assert.equal(h.getActiveBeatNumber(), 5);
  const preManualMove = h.getMoveTitle();
  const preAudioTime = h.audio.currentTime;

  // Teacher clicks Switch Move Now mid-bar on Beat 5
  h.el("nextMoveBtn").click();
  const manualMove = h.getMoveTitle();
  assert.notEqual(manualMove, preManualMove);
  assert.equal(h.audio.paused, false, "Audio must NOT pause on manual move switch");
  assert.equal(h.audio.currentTime, preAudioTime, "Audio time must NOT reset on manual move switch");
  assert.equal(h.getActiveBeatNumber(), 5, "Count 5 highlight must remain locked to music");

  // Beats 5..7 (Counts 6, 7, 8) finish the current bar in exact phase; beat 8 (Count 1) begins 2x8
  for (let b = 5; b <= 23; b++) {
    h.audio.currentTime = c1Sec + (b + 0.05) * T;
    h.stepRaf();
    assert.equal(h.getActiveBeatNumber(), (b % 8) + 1);
    assert.equal(h.getMoveTitle(), manualMove, `Manual move should complete 2 full 8-counts before switching (at beat ${b})`);
  }

  // Beat 24 (Count 1 after 2 full completed 8-counts starting at beat 8) switches automatically!
  h.audio.currentTime = c1Sec + 24.05 * T;
  h.stepRaf();
  assert.equal(h.getActiveBeatNumber(), 1);
  assert.notEqual(h.getMoveTitle(), manualMove);
});

// =========================================================================
// 5. rAF Throttling, Skipped Beats, Background Tabs, & Backward Seek
// =========================================================================
test("Background-tab rAF throttling and skipped beats never cause duplicate move transitions or truncated bars", async () => {
  const h = createAppHarness({ h4_dpa_audio_mode: "songs", h4_dpa_song_id: "115-block-party-brass" });
  h.el("startRandomDpaBtn").click();
  await h.flushMicrotasks();

  const song = h.SONGS.find((s) => s.id === "115-block-party-brass"); // piecewise anchored!
  let moveSwitchCount = 0;
  let lastMove = h.getMoveTitle();
  const trackSwitch = () => {
    const cur = h.getMoveTitle();
    if (cur !== lastMove) { moveSwitchCount++; lastMove = cur; }
  };

  // Start at phrase beats 0..3 (starting at firstCountOneSec, after the 4-beat intro pickup)
  for (let b = 0; b <= 3; b++) {
    h.audio.currentTime = h.getSongTimeForBeat(song, h.getSongCountOneBeat(song) + b + 0.1);
    h.stepRaf();
    trackSwitch();
  }
  assert.equal(moveSwitchCount, 0);

  // Simulate background tab sleeping for ~22 seconds (jumping straight to phrase beat 45.1, mid-bar Count 6)
  // Phrase beat 45 is Count 6 (45 % 8 = 5 -> display 6), crossing 5 bars (>= 2x8)!
  let tJump = h.getSongTimeForBeat(song, h.getSongCountOneBeat(song) + 45.1);
  h.audio.currentTime = tJump;
  h.stepRaf();
  trackSwitch();

  assert.equal(moveSwitchCount, 1, "Multi-bar tab sleep must trigger AT MOST ONE move transition");
  assert.equal(h.getActiveBeatNumber(), 6, "Must lock immediately to Beat 6 of the music");

  // Because we woke up mid-bar on Beat 6, phrase beats 46..47 finish the bar, beat 48 starts Count 1 of 2,
  // and next switch must NOT happen until phrase beat 64 (2 full 8-counts after beat 48)!
  let tCur = tJump;
  for (let targetBeat = 46; targetBeat <= 63; targetBeat++) {
    while (h.getSongPhraseBeatsElapsed(song, tCur) < targetBeat + 0.1) tCur += 0.005;
    h.audio.currentTime = tCur;
    h.stepRaf();
    trackSwitch();
    assert.equal(moveSwitchCount, 1, `Should not switch early on phrase beat ${targetBeat} after background wake`);
  }
  while (h.getSongPhraseBeatsElapsed(song, tCur) < 64.1) tCur += 0.005;
  h.audio.currentTime = tCur;
  h.stepRaf();
  trackSwitch();
  assert.equal(moveSwitchCount, 2, "Must switch cleanly on Count 1 at phrase beat 64");
  assert.equal(h.getActiveBeatNumber(), 1);

  // Backward seek into the intro pickup (before firstCountOneSec) must NOT trigger an erratic move switch
  h.audio.currentTime = Math.max(0, h.getSongFirstCountOneSec(song) - 0.5);
  h.audio.emit("seeked");
  h.stepRaf();
  trackSwitch();
  assert.equal(moveSwitchCount, 2, "Backward seek must not trigger spurious move switch");
  assert.equal(h.getActiveBeatNumber(), 0, "Pre-Count-1 intro seek must clear beat highlight cleanly");
});

// =========================================================================
// 6. Rapid Track Switching Ignores Stale Async play() Promises
// =========================================================================
test("Rapid Next Song switching cancels stale play() promises and locks cleanly to the final track", async () => {
  const h = createAppHarness({ h4_dpa_audio_mode: "songs", h4_dpa_song_id: "115-block-party-brass" });
  h.setDeferAudioPlay(true);

  h.el("startRandomDpaBtn").click();
  // Rapidly click Next Song 4 times while earlier play() calls are still pending
  h.el("nextSongBtn").click(); // Jumpstart Jam
  h.el("nextSongBtn").click(); // Arcade Bounce
  h.el("nextSongBtn").click(); // Recess Breakbeat 1
  h.el("nextSongBtn").click(); // Recess Breakbeat 2 (offset 0.282s)

  assert.equal(h.pendingPlayResolvers.length, 5);
  // Resolve an OLD stale promise FIRST (out of order!)
  h.pendingPlayResolvers[0].resolve();
  await h.flushMicrotasks();

  // Stale promise must NOT start a beat clock
  h.audio.currentTime = 1.0;
  h.stepRaf();
  assert.equal(h.getActiveBeatNumber(), 0, "Stale play() promise must not drive beat tracker");

  // Resolve the LATEST promise
  h.pendingPlayResolvers[4].resolve();
  await h.flushMicrotasks();

  // Before Recess Breakbeat 2 danceable Count 1 -> unlit with "Get Ready!"; just after Count 1 -> Count 1!
  const recess2 = h.SONGS.find((s) => s.id === "115-recess-breakbeat-2");
  const c1Sec = h.getSongFirstCountOneSec(recess2);
  h.audio.currentTime = c1Sec - 0.5;
  h.stepRaf();
  assert.equal(h.getActiveBeatNumber(), 0);
  assert.equal(h.el("eightCountCycleLabel").textContent, "Get Ready!");

  h.audio.currentTime = c1Sec + 0.03;
  h.stepRaf();
  assert.equal(h.getActiveBeatNumber(), 1);
  assert.equal(h.el("eightCountCycleLabel").textContent, "Count 1 of 2");
});

// =========================================================================
// 9. Configurable Device Visual Sync Offset (Default 0 ms, Rate-Scaled)
// =========================================================================
test("Visual sync offset defaults to 0ms and cleanly leads/lags timeline scaled by playbackRate", async () => {
  const h0 = createAppHarness({ h4_dpa_audio_mode: "songs", h4_dpa_song_id: "100-boom-bap-backpack" });
  h0.el("startRandomDpaBtn").click();
  await h0.flushMicrotasks();
  const song = h0.SONGS.find((s) => s.id === "100-boom-bap-backpack"); // exactBpm 92.50, offset 0.670

  // Default offset = 0ms: at beatOffsetSec - 0.02s -> still lead-in (0)
  h0.audio.currentTime = song.beatOffsetSec - 0.02;
  h0.stepRaf();
  assert.equal(h0.getActiveBeatNumber(), 0);

  // With +40ms visual lead (compensating display lag), at beatOffsetSec - 0.02s -> Count 1 already active!
  const hLead = createAppHarness({
    h4_dpa_audio_mode: "songs",
    h4_dpa_song_id: "100-boom-bap-backpack",
    h4_dpa_visual_offset_ms: "40",
  });
  hLead.el("startRandomDpaBtn").click();
  await hLead.flushMicrotasks();
  hLead.audio.currentTime = song.beatOffsetSec - 0.02;
  hLead.stepRaf();
  assert.equal(hLead.getActiveBeatNumber(), 1, "+40ms visual lead must advance Count 1 across boundary");

  // With -40ms visual lag (compensating Bluetooth/HDMI speaker latency), at beatOffsetSec + 0.02s -> still unlit!
  const hLag = createAppHarness({
    h4_dpa_audio_mode: "songs",
    h4_dpa_song_id: "100-boom-bap-backpack",
    h4_dpa_visual_offset_ms: "-40",
  });
  hLag.el("startRandomDpaBtn").click();
  await hLag.flushMicrotasks();
  hLag.audio.currentTime = song.beatOffsetSec + 0.02;
  hLag.stepRaf();
  assert.equal(hLag.getActiveBeatNumber(), 0, "-40ms visual lag must delay Count 1 across boundary");
  hLag.audio.currentTime = song.beatOffsetSec + 0.06;
  hLag.stepRaf();
  assert.equal(hLag.getActiveBeatNumber(), 1);
});

// =========================================================================
// 7. Beat Only Scheduling: Zero Stale or Duplicate Sounds on Pause, Resume, BPM Change, & Tab Return
// =========================================================================
test("Beat Only cancels queued lookahead sounds on Pause/BPM change and never schedules duplicate beats", async () => {
  const h = createAppHarness({ h4_dpa_audio_mode: "beat", h4_dpa_bpm: "120" });
  h.el("startRandomDpaBtn").click();
  await h.flushMicrotasks();

  // At 120 BPM (0.5s/beat), beat 0 is scheduled at audioNow + 0.025 = 10.025s
  const liveInitial = h.scheduledAudioEvents.filter((e) => e.isLiveAt(10.025));
  assert.ok(liveInitial.length >= 1, "Beat 0 should be scheduled on Beat Only start");

  // Advance to 10.45s (beat 1 at 10.525s is now queued inside 120ms lookahead!)
  h.setAudioNow(10.45);
  h.stepSchedulerIntervals();
  h.stepRaf();
  const queuedBeat1 = h.scheduledAudioEvents.filter((e) => Math.abs(e.when - 10.525) < 0.005 && e.isLiveAt(10.525));
  assert.ok(queuedBeat1.length >= 1, "Beat 1 should be queued inside 120ms lookahead");

  // Pause BEFORE beat 1 plays -> beat 1 MUST be muted/stopped immediately (no stale sound after pause!)
  h.el("playPauseBtn").click();
  const staleAfterPause = h.scheduledAudioEvents.filter((e) => Math.abs(e.when - 10.525) < 0.005 && e.isLiveAt(10.525));
  assert.equal(staleAfterPause.length, 0, "Queued lookahead sounds MUST be silenced immediately on Pause");

  // Rapidly Resume 20ms later -> beat 1 rescheduled cleanly ONCE (no duplicate/flammed hits)
  h.advanceAudioNow(0.02);
  h.el("playPauseBtn").click();
  const liveBeat1AfterResume = h.scheduledAudioEvents.filter((e) => e.when >= 10.47 && e.when <= 10.65 && e.isLiveAt(e.when));
  const uniqueTimes = new Set(liveBeat1AfterResume.map((e) => e.when.toFixed(3)));
  assert.equal(uniqueTimes.size, 1, "Exactly one scheduled beat timestamp after Pause/Resume (no duplicates)");

  // Change BPM (+5 -> 125 BPM) right before beat 1 fires -> old beat 1 cancelled, new single beat 1 scheduled
  h.el("bpmUpBtn").click();
  const liveAfterBpmChange = h.scheduledAudioEvents.filter((e) => e.when >= 10.47 && e.when <= 10.70 && e.isLiveAt(e.when));
  const uniqueAfterBpm = new Set(liveAfterBpmChange.map((e) => e.when.toFixed(3)));
  assert.equal(uniqueAfterBpm.size, 1, "BPM change must cancel old queued beat and schedule only one new beat");

  // Simulate background tab jump (+15 seconds) + visibilitychange -> no burst of 30 catch-up beats!
  const beforeJumpCount = h.scheduledAudioEvents.length;
  h.advanceAudioNow(15.0);
  h.setDocHidden(false);
  const newlyScheduled = h.scheduledAudioEvents.slice(beforeJumpCount);
  assert.ok(newlyScheduled.length <= 4, `Returning from background tab must NOT burst catch-up beats (scheduled ${newlyScheduled.length})`);
});

// =========================================================================
// 8. Own Music Mode: Manual Phase Recalibration & Honest UI Copy
// =========================================================================
test("Own Music mode supports manual Tap BPM phase recalibration without claiming auto audio sync", async () => {
  const h = createAppHarness({ h4_dpa_audio_mode: "own", h4_dpa_bpm: "100" });
  h.el("startRandomDpaBtn").click();
  await h.flushMicrotasks();

  // Status note must be honest about manual sync / not listening to external audio
  const note = h.el("musicStatusNote").textContent.toLowerCase();
  assert.ok(note.includes("does not listen"), `Expected explicit non-listening notice, got: ${note}`);

  // Advance 2.5 beats (1500ms at 100 BPM -> Beat 3)
  h.advancePerfNow(1500);
  h.stepRaf();
  assert.equal(h.getActiveBeatNumber(), 3);

  // Single tap on external song's Count 1 (>2s after any previous tap) snaps immediately to Count 1
  h.advancePerfNow(2500);
  h.el("tapBpmBtn").click();
  assert.equal(h.getActiveBeatNumber(), 1, "Single tap must manually recalibrate phase to Count 1");
  assert.equal(h.el("bpmDisplay").textContent, "100 BPM", "Single tap preserves existing BPM");

  // Tap 3 more times at 500ms intervals (120 BPM): Count 2, Count 3, Count 4
  h.advancePerfNow(500);
  h.el("tapBpmBtn").click();
  assert.equal(h.el("bpmDisplay").textContent, "120 BPM");
  assert.equal(h.getActiveBeatNumber(), 2);

  h.advancePerfNow(500);
  h.el("tapBpmBtn").click();
  assert.equal(h.getActiveBeatNumber(), 3);

  h.advancePerfNow(500);
  h.el("tapBpmBtn").click();
  assert.equal(h.getActiveBeatNumber(), 4);

  // Stop tapping: 510ms later, the tracker smoothly lands on Count 5!
  h.advancePerfNow(510);
  h.stepRaf();
  assert.equal(h.getActiveBeatNumber(), 5, "After 4-beat tap-in, Count 5 must follow cleanly in phase");
});

// =========================================================================
// 10. Musical Count 1, Intro Inactivity, & "Get Ready!" Status Across All 24 Tracks
// =========================================================================
test("Intro stays inactive with 'Get Ready!' until first danceable Count 1 across all 24 tracks", async () => {
  const h = createAppHarness({ h4_dpa_audio_mode: "songs", h4_dpa_song_id: "115-block-party-brass" });
  h.el("startRandomDpaBtn").click();
  await h.flushMicrotasks();

  const bp = h.SONGS.find((s) => s.id === "115-block-party-brass");
  assert.equal(h.getSongCountOneBeat(bp), 36, "Block Party Brass must wait until full drum groove at beat 36");
  const c1Sec = h.getSongFirstCountOneSec(bp);
  assert.ok(c1Sec > 18.70 && c1Sec < 18.85, `Expected Block Party Brass danceable Count 1 near 18.77s, got ${c1Sec.toFixed(3)}s`);

  const initialMove = h.getMoveTitle();

  // Play from t = 0.00s across the entire 36-beat intro (raw beats 0..35) -> MUST stay unlit with "Get Ready!" & zero move switches
  for (const rawBeat of [0.05, 4.05, 12.05, 20.05, 28.05, 35.85]) {
    const t = Math.max(0, h.getSongTimeForBeat(bp, rawBeat));
    h.audio.currentTime = t;
    h.stepRaf();
    assert.equal(h.getActiveBeatNumber(), 0, `Intro rawBeat ${rawBeat} (t=${t.toFixed(3)}s) must keep all 8 numbers inactive`);
    assert.equal(h.el("eightCountCycleLabel").textContent, "Get Ready!", "Must display 'Get Ready!' during intro");
    assert.equal(h.el("eightCountCycleLabel").classList.contains("is-intro"), true, "Must apply is-intro badge class during intro");
    assert.equal(h.getMoveTitle(), initialMove, `Intro rawBeat ${rawBeat} must NOT trigger move transition`);
  }

  // Right after danceable Count 1 (raw beat 36.05, t ~ 18.80s): Count 1 MUST activate & "Get Ready!" clears cleanly
  h.audio.currentTime = h.getSongTimeForBeat(bp, 36.05);
  h.stepRaf();
  assert.equal(h.getActiveBeatNumber(), 1, "Musical Count 1 must activate precisely at rawBeat 36 (firstCountOneSec)");
  assert.equal(h.el("eightCountCycleLabel").textContent, "Count 1 of 2");
  assert.equal(h.el("eightCountCycleLabel").classList.contains("is-intro"), false);
  assert.equal(h.getMoveTitle(), initialMove);

  // Step through 2 full musical 8-counts (phrase beats 0..15 -> raw beats 36..51)
  for (let pb = 1; pb <= 15; pb++) {
    h.audio.currentTime = h.getSongTimeForBeat(bp, 36 + pb + 0.05);
    h.stepRaf();
    assert.equal(h.getActiveBeatNumber(), (pb % 8) + 1, `Phrase beat ${pb} should display Count ${(pb % 8) + 1}`);
    assert.equal(h.getMoveTitle(), initialMove, `Must stay on initial move through phrase beat ${pb}`);
  }

  // Phrase beat 16 (raw beat 52, ~27.09s) -> 2x8 automatic move switch fires strictly on musical Count 1!
  h.audio.currentTime = h.getSongTimeForBeat(bp, 52.05);
  h.stepRaf();
  assert.equal(h.getActiveBeatNumber(), 1, "Auto move transition must occur on musical Count 1");
  assert.notEqual(h.getMoveTitle(), initialMove, "2x8 automatic move switch must fire at phrase beat 16 (raw beat 52)");

  // Verify every song with countOneBeat > 0 (19 tracks) shows "Get Ready!" during intro and activates Count 1 at firstCountOneSec
  const introSongs = h.SONGS.filter((s) => h.getSongCountOneBeat(s) > 0);
  assert.equal(introSongs.length, 19, "Expected 19 tracks with intro countOneBeat > 0");
  for (const s of introSongs) {
    const hSong = createAppHarness({ h4_dpa_audio_mode: "songs", h4_dpa_song_id: s.id });
    hSong.el("startRandomDpaBtn").click();
    await hSong.flushMicrotasks();

    const c1 = hSong.getSongCountOneBeat(s);
    const tMidIntro = hSong.getSongTimeForBeat(s, Math.max(0.5, c1 - 2.5));
    hSong.audio.currentTime = tMidIntro;
    hSong.stepRaf();
    assert.equal(hSong.getActiveBeatNumber(), 0, `${s.id} must stay inactive during intro at t=${tMidIntro.toFixed(3)}s`);
    assert.equal(hSong.el("eightCountCycleLabel").textContent, "Get Ready!", `${s.id} must display 'Get Ready!' during intro`);

    const tCount1 = hSong.getSongTimeForBeat(s, c1 + 0.05);
    hSong.audio.currentTime = tCount1;
    hSong.stepRaf();
    assert.equal(hSong.getActiveBeatNumber(), 1, `${s.id} must activate Count 1 at beat ${c1} (t=${tCount1.toFixed(3)}s)`);
    assert.equal(hSong.el("eightCountCycleLabel").textContent, "Count 1 of 2");
  }

  // Verify all 5 immediate-groove tracks (countOneBeat = 0) remain preserved
  const immediateIds = [
    "100-boom-bap-backpack",
    "100-robot-factory-1",
    "95-cool-down-cypher-2",
    "95-chalkboard-funk-1",
    "95-chalkboard-funk-2",
  ];
  for (const id of immediateIds) {
    const hZero = createAppHarness({ h4_dpa_audio_mode: "songs", h4_dpa_song_id: id });
    hZero.el("startRandomDpaBtn").click();
    await hZero.flushMicrotasks();
    const s = hZero.SONGS.find((x) => x.id === id);
    assert.equal(hZero.getSongCountOneBeat(s), 0, `${id} should have countOneBeat = 0`);
    hZero.audio.currentTime = s.beatOffsetSec + 0.04;
    hZero.stepRaf();
    assert.equal(hZero.getActiveBeatNumber(), 1, `${id} must still activate Count 1 right after beatOffsetSec`);
  }
});
