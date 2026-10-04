import { AUDIO_BASE, LOOP_MANIFEST, LOOPS, SOUNDS, variantFiles, type Bus, type LoopId, type LoopWindows, type SoundId } from "./catalog";
import {
  attenuation,
  CombatIntensity,
  crossfadeGains,
  dbToGain,
  jitter,
  muffleCutoff,
  pan,
  VoiceLimiter,
  zoomGain,
  type Listener,
} from "./mix";
import { clampVolume, loadMuted, loadVolumes, saveMuted, saveVolumes, type Volumes } from "./settings";

// A bus's level with its slider at full: the music sits low under the game, the effects carry it.
const BUS_TRIM: Record<Bus, number> = { music: 0.35, ambience: 0.8, effects: 1 };
const GLOBAL_VOICES = 28;
// Time constants (seconds) of gain changes; a target is ~95% reached after three of them.
const SLIDER_SMOOTHING = 0.05;
const BED_SMOOTHING = 1.5;
const BED_FADE_IN = 0.8;
const BED_FADE_OUT = 0.4;
const BED_STOP_DELAY = 2;
const EVICT_SMOOTHING = 0.015;
const EVICT_STOP_DELAY = 0.08;
// How often (ms) the beds follow the combat intensity.
const BED_UPDATE_MS = 250;
// Cutoffs above this leave a voice unfiltered.
const UNMUFFLED_HZ = 16000;
const COMPRESSOR = { threshold: -14, knee: 8, ratio: 6, attack: 0.003, release: 0.25 };
const DEFAULT_LISTENER: Listener = { x: 0, y: 0, zoom: 30 };

interface Graph {
  context: AudioContext;
  master: GainNode;
  buses: Record<Bus, GainNode>;
}

interface Bed {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

interface PlayingVoice {
  source: AudioBufferSourceNode;
  amp: GainNode;
  /** The node feeding the bus, disconnected when the voice ends. */
  output: AudioNode;
}

const LOOP_IDS = Object.keys(LOOPS) as LoopId[];
const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];
const ALL_FILES = [...SOUND_IDS.flatMap(variantFiles), ...LOOP_IDS.map((id) => LOOPS[id].file)];

/**
 * Plays recorded effects through music, ambience and effects buses into a compressor and the master mute. World
 * sounds are panned, attenuated and muffled by distance from the camera focus; the soundscape crossfades a peace
 * bed into a war bed as nearby combat builds up.
 */
export class AudioBoard {
  muted = loadMuted();
  readonly volumes: Volumes = loadVolumes();
  private graph: Graph | null = null;
  private meters: Record<string, AnalyserNode> | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private loopWindows: LoopWindows = {};
  private readonly limiter = new VoiceLimiter(GLOBAL_VOICES);
  private readonly voices = new Map<number, PlayingVoice>();
  private readonly intensity = new CombatIntensity();
  private readonly lastStart = new Map<SoundId, number>();
  private listener: Listener = DEFAULT_LISTENER;
  private beds: Partial<Record<LoopId, Bed>> = {};
  private soundscapeWanted = false;
  private lastBedUpdate = 0;
  private nextVoiceId = 1;
  private readonly plays = new Map<SoundId, number>();

  /** Creates or resumes the AudioContext; browsers only allow it to run after a user gesture. */
  unlock(): void {
    const graph = this.ensureGraph();
    if (graph && graph.context.state !== "running") graph.context.resume().catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    saveMuted(muted);
    this.ramp(this.graph?.master.gain, muted ? 0 : 1, SLIDER_SMOOTHING);
  }

  setVolume(bus: Bus, value: number): void {
    this.volumes[bus] = clampVolume(value);
    saveVolumes(this.volumes);
    this.ramp(this.graph?.buses[bus].gain, this.busGain(bus), SLIDER_SMOOTHING);
  }

  /** A sound heard the same wherever the camera is: interface feedback and notifications. */
  play(sound: SoundId): void {
    this.start(sound, 1, 0, 0, Infinity);
  }

  /** A sound at a map point, delayed by `delaySeconds`; it also feeds the war soundscape if it is a combat sound. */
  playAt(sound: SoundId, x: number, y: number, delaySeconds = 0): void {
    const level = attenuation(this.listener, x, y);
    const weight = SOUNDS[sound].intensity;
    if (weight) this.intensity.add(weight * level, seconds());
    this.start(sound, level * zoomGain(this.listener.zoom), pan(this.listener, x), delaySeconds, muffleCutoff(level));
  }

  /** The camera focus and zoom, read every frame. */
  setListener(x: number, y: number, zoom: number): void {
    this.listener = { x, y, zoom };
    this.followIntensity();
  }

  /** Starts the ambience beds and the music for a match, once the first gesture has unlocked audio and they have loaded. */
  startSoundscape(): void {
    if (this.soundscapeWanted) return;
    this.soundscapeWanted = true;
    this.intensity.reset();
    this.startBeds();
  }

  stopSoundscape(): void {
    this.soundscapeWanted = false;
    const graph = this.graph;
    if (!graph) return;
    const time = graph.context.currentTime;
    for (const bed of Object.values(this.beds)) {
      this.ramp(bed.gain.gain, 0, BED_FADE_OUT);
      bed.source.stop(time + BED_STOP_DELAY);
    }
    this.beds = {};
  }

  /** Live mixer state for development tooling; the first call taps level meters onto the buses. */
  debugState() {
    const graph = this.graph;
    return {
      levels: graph ? this.meterLevels(graph) : {},
      context: graph?.context.state ?? "none",
      sampleRate: graph?.context.sampleRate ?? 0,
      loaded: this.buffers.size,
      expected: ALL_FILES.length,
      voices: this.limiter.count,
      muted: this.muted,
      warMix: this.intensity.warMix(seconds()),
      plays: Object.fromEntries(this.plays),
      buses: Object.fromEntries(Object.entries(graph?.buses ?? {}).map(([bus, node]) => [bus, node.gain.value])),
      beds: Object.fromEntries(
        Object.entries(this.beds).map(([id, bed]) => [id, { gain: bed.gain.gain.value, seconds: bed.source.buffer?.duration, loopStart: bed.source.loopStart, loopEnd: bed.source.loopEnd }]),
      ),
    };
  }

  /** Current RMS and peak level (dBFS) of each bus and the master output. */
  private meterLevels(graph: Graph): Record<string, { rms: number; peak: number }> {
    if (!this.meters) {
      const meters: Record<string, AnalyserNode> = {};
      for (const [name, node] of [...Object.entries(graph.buses), ["master", graph.master] as const]) {
        meters[name] = graph.context.createAnalyser();
        node.connect(meters[name]);
      }
      this.meters = meters;
    }
    return Object.fromEntries(
      Object.entries(this.meters).map(([name, meter]) => {
        const samples = new Float32Array(meter.fftSize);
        meter.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
        const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
        return [name, { rms: decibels(rms), peak: decibels(peak) }];
      }),
    );
  }

  private start(sound: SoundId, level: number, panning: number, delaySeconds: number, cutoff: number): void {
    if (this.muted) return;
    const def = SOUNDS[sound];
    const nowMs = performance.now();
    if (def.minInterval && nowMs - (this.lastStart.get(sound) ?? -Infinity) < def.minInterval) return;
    // Before the first gesture there is no context yet: sounds are skipped rather than queued.
    const graph = this.graph;
    const files = variantFiles(sound);
    const buffer = this.buffers.get(files[Math.floor(Math.random() * files.length)]!);
    if (!graph || !buffer) return;
    const gainDb = (Math.random() * 2 - 1) * (def.gainJitter ?? 0);
    const gain = def.gain * level * dbToGain(gainDb);
    const admission = this.limiter.admit(sound, gain, def.maxVoices, nowMs / 1000);
    if (!admission.admitted) return;
    if (admission.evict) this.stopVoice(admission.evict.id);
    this.lastStart.set(sound, nowMs);
    this.plays.set(sound, (this.plays.get(sound) ?? 0) + 1);
    const voice = this.connectVoice(graph, buffer, gain, panning, cutoff);
    voice.source.playbackRate.value = jitter(Math.random, def.pitchJitter ?? 0);
    const id = this.nextVoiceId++;
    this.voices.set(id, voice);
    this.limiter.add({ id, sound, gain, started: nowMs / 1000 });
    voice.source.onended = () => {
      this.limiter.remove(id);
      this.voices.delete(id);
      voice.output.disconnect();
    };
    voice.source.start(graph.context.currentTime + delaySeconds);
  }

  /** Source → optional distance low-pass → gain → optional panner → effects bus. */
  private connectVoice(graph: Graph, buffer: AudioBuffer, gain: number, panning: number, cutoff: number): PlayingVoice {
    const { context } = graph;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const amp = context.createGain();
    amp.gain.value = gain;
    if (cutoff < UNMUFFLED_HZ) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      source.connect(filter).connect(amp);
    } else {
      source.connect(amp);
    }
    let output: AudioNode = amp;
    if (panning !== 0) {
      const panner = context.createStereoPanner();
      panner.pan.value = panning;
      output = amp.connect(panner);
    }
    output.connect(graph.buses.effects);
    return { source, amp, output };
  }

  /** Fades a voice out fast enough to free its slot without a click. */
  private stopVoice(id: number): void {
    const voice = this.voices.get(id);
    this.limiter.remove(id);
    if (!voice) return;
    this.ramp(voice.amp.gain, 0, EVICT_SMOOTHING);
    voice.source.stop(voice.amp.context.currentTime + EVICT_STOP_DELAY);
  }

  private ensureGraph(): Graph | null {
    if (this.graph) return this.graph;
    if (typeof AudioContext === "undefined") return null;
    let context: AudioContext;
    try {
      context = new AudioContext();
    } catch {
      return null;
    }
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = COMPRESSOR.threshold;
    compressor.knee.value = COMPRESSOR.knee;
    compressor.ratio.value = COMPRESSOR.ratio;
    compressor.attack.value = COMPRESSOR.attack;
    compressor.release.value = COMPRESSOR.release;
    const master = context.createGain();
    master.gain.value = this.muted ? 0 : 1;
    compressor.connect(master).connect(context.destination);
    const buses = {} as Record<Bus, GainNode>;
    for (const bus of Object.keys(BUS_TRIM) as Bus[]) {
      buses[bus] = context.createGain();
      buses[bus].gain.value = this.busGain(bus);
      buses[bus].connect(compressor);
    }
    this.graph = { context, master, buses };
    void this.loadAll(context);
    return this.graph;
  }

  private async loadAll(context: AudioContext): Promise<void> {
    const loops = new Set<string>(LOOP_IDS.map((id) => LOOPS[id].file));
    const windows = this.loadLoopWindows();
    await Promise.all(
      ALL_FILES.map(async (name) => {
        try {
          const response = await fetch(`${AUDIO_BASE}${name}.mp3`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          this.buffers.set(name, await context.decodeAudioData(await response.arrayBuffer()));
          if (!loops.has(name)) return;
          await windows;
          this.startBeds();
        } catch (error) {
          console.warn(`Could not load the sound ${name}.`, error);
        }
      }),
    );
  }

  /** Starts every bed whose file is loaded, faded in to its current share of the mix. */
  private startBeds(): void {
    const graph = this.graph;
    if (!graph || !this.soundscapeWanted) return;
    const mix = crossfadeGains(this.intensity.warMix(seconds()));
    const levels: Record<LoopId, number> = { peace: mix.peace, war: mix.war, music: 1 };
    for (const id of LOOP_IDS) {
      const buffer = this.buffers.get(LOOPS[id].file);
      if (this.beds[id] || !buffer) continue;
      const source = graph.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      // Without its window a loop still plays, wrapping over the codec padding at the file's ends.
      const window = this.loopWindows[LOOPS[id].file] ?? { start: 0, end: buffer.duration };
      source.loopStart = window.start;
      source.loopEnd = window.end;
      const gain = graph.context.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(graph.buses[LOOPS[id].bus]);
      this.ramp(gain.gain, levels[id], BED_FADE_IN);
      source.start(graph.context.currentTime, source.loopStart);
      this.beds[id] = { source, gain };
    }
  }

  private async loadLoopWindows(): Promise<void> {
    try {
      const response = await fetch(`${AUDIO_BASE}${LOOP_MANIFEST}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.loopWindows = (await response.json()) as LoopWindows;
    } catch (error) {
      console.warn("Could not load the loop windows.", error);
    }
  }

  /** Leans the beds towards war or peace as combat near the camera builds up or dies down. */
  private followIntensity(): void {
    const nowMs = performance.now();
    if (nowMs - this.lastBedUpdate < BED_UPDATE_MS) return;
    this.lastBedUpdate = nowMs;
    const mix = crossfadeGains(this.intensity.warMix(nowMs / 1000));
    this.ramp(this.beds.peace?.gain.gain, mix.peace, BED_SMOOTHING);
    this.ramp(this.beds.war?.gain.gain, mix.war, BED_SMOOTHING);
  }

  private busGain(bus: Bus): number {
    return this.volumes[bus] ** 2 * BUS_TRIM[bus];
  }

  /** Glides a gain to a target from wherever it is now. */
  private ramp(param: AudioParam | undefined, target: number, timeConstant: number): void {
    const context = this.graph?.context;
    if (!param || !context) return;
    const time = context.currentTime;
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
    param.setTargetAtTime(target, time, timeConstant);
  }
}

function seconds(): number {
  return performance.now() / 1000;
}

function decibels(level: number): number {
  return Math.round(20 * Math.log10(Math.max(level, 1e-6)));
}
