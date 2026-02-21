<script lang="ts">
	import { onDestroy } from 'svelte';
	import * as Tone from 'tone';

	type NoteEvent = {
		id: string;
		midi: number;
		time: number;
		duration: number;
		velocity: number;
	};

	type MidiDataLike = {
		duration: number;
		tracks: Array<{
			instrument?: {
				percussion?: boolean;
			};
			notes: Array<{
				midi: number;
				time: number;
				duration: number;
				velocity: number;
			}>;
		}>;
	};

	const minMidi = 21;
	const maxMidi = 108;
	const lookAheadSec = 4;
	const noteViewHeight = 440;

	let loadedName = '';
	let notes: NoteEvent[] = [];
	let totalDuration = 0;
	let playheadSec = 0;
	let isPlaying = false;
	let error = '';

	let synth: Tone.PolySynth | null = null;
	let part: Tone.Part<NoteEvent> | null = null;
	let rafId: number | null = null;

	const pianoKeys = Array.from({ length: maxMidi - minMidi + 1 }, (_, i) => minMidi + i);

	const isBlackKey = (midi: number) => {
		const pitchClass = midi % 12;
		return [1, 3, 6, 8, 10].includes(pitchClass);
	};

	const isActiveKey = (midi: number) =>
		notes.some((note) => note.midi === midi && playheadSec >= note.time && playheadSec < note.time + note.duration);

	const visibleNotes = () => {
		const minTime = playheadSec - 0.25;
		const maxTime = playheadSec + lookAheadSec;
		return notes.filter((note) => note.time + note.duration >= minTime && note.time <= maxTime);
	};

	function noteLeftPercent(midi: number): number {
		return ((midi - minMidi) / (maxMidi - minMidi + 1)) * 100;
	}

	function noteWidthPercent(): number {
		return 100 / (maxMidi - minMidi + 1);
	}

	function noteHeightPx(durationSec: number): number {
		return Math.max(8, (durationSec / lookAheadSec) * noteViewHeight);
	}

	function noteTopPx(note: NoteEvent): number {
		const height = noteHeightPx(note.duration);
		const delta = note.time - playheadSec;
		return ((lookAheadSec - delta) / lookAheadSec) * noteViewHeight - height;
	}

	function animationLoop() {
		if (!isPlaying) return;
		playheadSec = Tone.Transport.seconds;
		if (playheadSec >= totalDuration) {
			stop();
			return;
		}
		rafId = requestAnimationFrame(animationLoop);
	}

	async function handleFileSelect(event: Event) {
		error = '';
		stop();
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			const midiModule = (await import('@tonejs/midi')) as unknown as {
				Midi?: new (data: ArrayBuffer) => MidiDataLike;
				default?: { Midi?: new (data: ArrayBuffer) => MidiDataLike } | (new (data: ArrayBuffer) => MidiDataLike);
			};
			const MidiCtor = midiModule.Midi ?? (midiModule.default as { Midi?: new (data: ArrayBuffer) => MidiDataLike } | undefined)?.Midi ?? (typeof midiModule.default === 'function' ? midiModule.default : undefined);

			if (!MidiCtor) {
				throw new Error('MIDI 파서 로드에 실패했습니다.');
			}

			const bytes = await file.arrayBuffer();
			const midi = new MidiCtor(bytes);

			const mergedNotes = midi.tracks
				.filter((track) => !track.instrument?.percussion)
				.flatMap((track) => track.notes)
				.map((note) => ({
					id: '',
					midi: note.midi,
					time: note.time,
					duration: note.duration,
					velocity: note.velocity
				}))
				.filter((note) => note.midi >= minMidi && note.midi <= maxMidi)
				.sort((a, b) => a.time - b.time)
				.map((note, index) => ({
					...note,
					id: `${index}-${note.time}-${note.midi}-${note.duration}`
				}));

			if (mergedNotes.length === 0) {
				throw new Error('노트가 있는 트랙을 찾지 못했습니다.');
			}

;
			notes = mergedNotes;

			totalDuration = midi.duration || Math.max(...mergedNotes.map((n) => n.time + n.duration));
			loadedName = file.name;
			playheadSec = 0;
		} catch (e) {
			error = e instanceof Error ? e.message : 'MIDI 파일 파싱 중 오류가 발생했습니다.';
		}
	}

	async function play() {
		if (notes.length === 0) {
			error = '먼저 MIDI 파일을 선택하세요.';
			return;
		}

		error = '';
		try {
			await Tone.start();
		} catch {
			error = '오디오 컨텍스트 시작에 실패했습니다. 브라우저 설정을 확인해주세요.';
			return;
		}

		if (!synth) {
			synth = new Tone.PolySynth(Tone.Synth, {
				oscillator: { 
					type: 'triangle', 
					partials: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] 
				},
				envelope: { 
					attack: 0.005, 
					decay: 0.6, 
					sustain: 0.2, 
					release: 1.0 
				}
			}).toDestination();
		}

		if (part) {
			part.dispose();
			part = null;
		}

		Tone.Transport.stop();
		Tone.Transport.cancel();
		Tone.Transport.position = 0;

		part = new Tone.Part<NoteEvent>((time, note) => {
			const noteName = Tone.Frequency(note.midi, 'midi').toNote();
			const velocity = Math.max(0.1, note.velocity / 127);
			if (synth) {
				synth.triggerAttackRelease(noteName, note.duration, time, velocity);
			}
		}, notes).start(0);

		Tone.Transport.start();
		isPlaying = true;
		if (rafId) cancelAnimationFrame(rafId);
		rafId = requestAnimationFrame(animationLoop);
	}

	function stop() {
		Tone.Transport.stop();
		Tone.Transport.cancel();
		isPlaying = false;
		playheadSec = 0;
		if (part) {
			part.dispose();
			part = null;
		}
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	}

	onDestroy(() => {
		stop();
		synth?.dispose();
		synth = null;
	});
</script>

<main class="page">
	<section class="controls">
		<input type="file" accept=".mid,.midi" on:change={handleFileSelect} />
		<button on:click={play} disabled={notes.length === 0 || isPlaying}>재생</button>
		<button on:click={stop} disabled={!isPlaying && playheadSec === 0}>정지</button>
		<span class="meta">{loadedName ? `${loadedName} · ${totalDuration.toFixed(2)}s · ${notes.length} notes` : 'MIDI 파일을 선택하세요'}</span>
	</section>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	<section class="player">
		<div class="waterfall" style={`height:${noteViewHeight}px`}>
			{#each visibleNotes() as note (note.id)}
				<div
					class="falling-note"
					style={`left:${noteLeftPercent(note.midi)}%;width:${noteWidthPercent()}%;height:${noteHeightPx(note.duration)}px;top:${noteTopPx(note)}px;`}
				></div>
			{/each}
			<div class="hit-line"></div>
		</div>

		<div class="keyboard">
			{#each pianoKeys as midi}
				<div class={`key ${isBlackKey(midi) ? 'black' : 'white'} ${isActiveKey(midi) ? 'active' : ''}`}></div>
			{/each}
		</div>
	</section>
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
		background: #0f1117;
		color: #e8ecf1;
	}

	.page {
		min-height: 100vh;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		box-sizing: border-box;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	button {
		padding: 8px 14px;
		border-radius: 8px;
		border: 1px solid #3a4152;
		background: #1f2636;
		color: #e8ecf1;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.meta {
		opacity: 0.85;
	}

	.error {
		margin: 0;
		color: #ff8e8e;
	}

	.player {
		border: 1px solid #2d3444;
		border-radius: 12px;
		overflow: hidden;
		background: #121826;
	}

	.waterfall {
		position: relative;
		background: linear-gradient(180deg, #0c1220 0%, #111a2c 100%);
		overflow: hidden;
	}

	.falling-note {
		position: absolute;
		border-radius: 3px;
		background: rgba(79, 183, 255, 0.85);
		box-shadow: 0 0 8px rgba(79, 183, 255, 0.35);
	}

	.hit-line {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 2px;
		background: #ffd24d;
	}

	.keyboard {
		height: 120px;
		display: grid;
		grid-template-columns: repeat(88, minmax(0, 1fr));
		border-top: 1px solid #2d3444;
	}

	.key {
		border-right: 1px solid #1a2232;
		box-sizing: border-box;
	}

	.key.white {
		background: #f1f4fb;
	}

	.key.black {
		background: #202634;
	}

	.key.active.white {
		background: #7ec8ff;
	}

	.key.active.black {
		background: #3d8ad6;
	}
</style>
