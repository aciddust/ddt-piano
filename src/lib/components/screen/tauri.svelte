<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';
	import type { Score, KeyMaps, ProcessInfo, ScoreNote } from '@/interface';
	import { invoke } from '@tauri-apps/api/core';
	import { listen, type UnlistenFn } from '@tauri-apps/api/event';
	import { save } from '@tauri-apps/plugin-dialog';
	import { writeFile } from '@tauri-apps/plugin-fs';

	export let minimizeWindow: () => Promise<void>;
	export let closeWindow: () => Promise<void>;

	let currentInstrument = 'heartopia';
	let isPlaying = false;
	let isPaused = false;
	let currentScore: Score | null = null;
	let adjustedScore: Score | null = null; // pitch/octave 적용된 악보
	let currentMidiFile: { data: Uint8Array; name: string } | null = null;
	let selectedPid = '';
	let isDetectingProcess = false;
	let processDetected = false;
	let transposition = 0; // 반음 단위 (-12 ~ +12)
	let octaveShift = 0; // 옥타브 단위 (-2 ~ +2)
	let clipStats: { total: number; clipped: number } | null = null;
	let recommendedShift: { shift: number; clipped: number; total: number } | null = null;
	let isArranged = false; // 3옥타브 편곡 적용 여부
	let playbackState: { events: TimelineEvent[]; elapsed: number } | null = null;
	let playbackClock: { startAt: number; offset: number } | null = null;

	let keyMaps: KeyMaps = {
		heartopia: {
			c2: ',',
			c2b: 'l',
			d2: '.',
			d2b: ';',
			e2: '/',
			f2: 'o',
			f2b: '0',
			g2: 'p',
			g2b: '-',
			a2: '[',
			a2b: '=',
			b2: ']',
			c3: 'z',
			c3b: 's',
			d3: 'x',
			d3b: 'd',
			e3: 'c',
			f3: 'v',
			f3b: 'g',
			g3: 'b',
			g3b: 'h',
			a3: 'n',
			a3b: 'j',
			b3: 'm',
			c4: 'q',
			c4b: '2',
			d4: 'w',
			d4b: '3',
			e4: 'e',
			f4: 'r',
			f4b: '5',
			g4: 't',
			g4b: '6',
			a4: 'y',
			a4b: '7',
			b4: 'u',
			c5: 'i'
		}
	};

	let tauriReady = false;

	interface TimelineEvent {
		time: number;
		keysToPress: string[];
		keysToRelease: string[];
	}

	// 초기 로드 시 xdt.exe 감지
	onMount(() => {
		const hasTauri =
			browser &&
			typeof window !== 'undefined' &&
			!!((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
		tauriReady = hasTauri;
		if (!hasTauri) {
			console.warn('Tauri environment not detected');
		}
		detectXdtProcess();

		let unlisten: UnlistenFn | null = null;
		if (hasTauri) {
			(async () => {
				unlisten = await listen<string>('global-shortcut', async (event) => {
					if (event.payload === 'toggle-play') {
						await togglePlayPause();
						return;
					}
					if (event.payload === 'stop') {
						await stopMacro();
					}
				});
			})();
		}

		return () => {
			if (unlisten) {
				unlisten();
			}
		};
	});

	// xdt.exe 프로세스 자동 감지 (heartopia 전용)
	async function detectXdtProcess() {
		if (currentInstrument !== 'heartopia') {
			// heartopia가 아닌 다른 악기는 프로세스 감지 안 함
			processDetected = true;
			selectedPid = '1'; // dummy pid
			return;
		}

		isDetectingProcess = true;
		try {
			const processes = await invoke<ProcessInfo[]>('list_processes');
			const xdtProcess = processes.find((p) => p.name.toLowerCase() === 'xdt.exe');

			if (xdtProcess) {
				selectedPid = String(xdtProcess.pid);
				processDetected = true;
			} else {
				selectedPid = '';
				processDetected = false;
				toast.warning('두근두근타운을 실행해주세요.');
			}
		} catch (error) {
			toast.error('프로세스 감지 실패');
			console.error(error);
			processDetected = false;
		} finally {
			isDetectingProcess = false;
		}
	}

	async function focusSelectedProcess() {
		const pid = Number(selectedPid);
		if (!pid || Number.isNaN(pid)) {
			toast.error('게임이 감지되지 않았습니다');
			throw new Error('Invalid pid');
		}
		await invoke('focus_process', { pid });
		// Unity 게임 등은 포커스 전환에 시간이 필요
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	function buildTimeline(scoreToPlay: Score): TimelineEvent[] {
		const events: TimelineEvent[] = [];
		const instrumentMap = keyMaps[currentInstrument];

		for (const note of scoreToPlay.notes) {
			if (note.rest) continue;
			if (!note.keys || note.keys.length === 0) continue;

			const keysToPress = note.keys
				.map((k) => instrumentMap[k])
				.filter((k): k is string => k !== undefined);

			if (keysToPress.length === 0) continue;

			let startEvent = events.find((e) => e.time === note.startTime);
			if (!startEvent) {
				startEvent = { time: note.startTime, keysToPress: [], keysToRelease: [] };
				events.push(startEvent);
			}
			startEvent.keysToPress.push(...keysToPress);

			let endEvent = events.find((e) => e.time === note.endTime);
			if (!endEvent) {
				endEvent = { time: note.endTime, keysToPress: [], keysToRelease: [] };
				events.push(endEvent);
			}
			endEvent.keysToRelease.push(...keysToPress);
		}

		events.sort((a, b) => a.time - b.time);
		return events;
	}

	function getAllKeys(scoreToPlay: Score): string[] {
		const instrumentMap = keyMaps[currentInstrument];
		const allKeys = scoreToPlay.notes
			.filter((n) => !n.rest && n.keys)
			.flatMap((n) =>
				(n.keys || []).map((k) => instrumentMap[k]).filter((k): k is string => k !== undefined)
			);
		return [...new Set(allKeys)];
	}

	async function releaseAllKeys(scoreToPlay: Score) {
		const uniqueKeys = getAllKeys(scoreToPlay);
		if (uniqueKeys.length > 0) {
			await invoke('key_up', { keys: uniqueKeys });
		}
	}

	async function startPlayback(fromElapsed = 0) {
		const scoreToPlay = adjustedScore || currentScore;

		if (!scoreToPlay) {
			toast.error('악보를 먼저 로드하세요');
			return;
		}
		if (!selectedPid || !processDetected) {
			toast.error('게임이 감지되지 않았습니다. 새로고침 버튼을 눌러주세요.');
			return;
		}

		if (!playbackState) {
			const events = buildTimeline(scoreToPlay);
			if (events.length === 0) {
				toast.error('연주할 노트가 없습니다');
				return;
			}
			playbackState = { events, elapsed: 0 };
		}

		isPlaying = true;
		isPaused = false;

		try {
			await focusSelectedProcess();

			const events = playbackState.events;
			let lastTime = fromElapsed;
			let startIndex = 0;
			while (startIndex < events.length && events[startIndex].time < fromElapsed) {
				startIndex++;
			}

			playbackClock = { startAt: performance.now(), offset: fromElapsed };
			let completed = true;
			for (let i = startIndex; i < events.length; i++) {
				if (!isPlaying) {
					completed = false;
					break;
				}

				const event = events[i];
				const waitTime = event.time - lastTime;
				if (waitTime > 0) {
					await new Promise((resolve) => setTimeout(resolve, waitTime));
				}

				if (!isPlaying) {
					completed = false;
					break;
				}

				if (event.keysToRelease.length > 0) {
					await invoke('key_up', { keys: event.keysToRelease });
				}

				if (event.keysToPress.length > 0) {
					await invoke('key_down', { keys: event.keysToPress });
				}

				lastTime = event.time;
			}

			if (completed) {
				await releaseAllKeys(scoreToPlay);
				playbackState = null;
				playbackClock = null;
				toast.success('매크로 실행 완료');
			} else if (isPaused && playbackClock) {
				playbackState.elapsed = playbackClock.offset + (performance.now() - playbackClock.startAt);
				playbackClock = null;
			}
		} catch (error) {
			toast.error('매크로 실행 중 오류 발생');
			console.error(error);
		} finally {
			if (!isPaused) {
				isPlaying = false;
				playbackClock = null;
			}
		}
	}

	async function playMacro() {
		playbackState = null;
		await startPlayback(0);
	}

	async function pauseMacro() {
		if (!isPlaying) return;
		isPaused = true;
		isPlaying = false;
		if (playbackState && playbackClock) {
			playbackState.elapsed = playbackClock.offset + (performance.now() - playbackClock.startAt);
			playbackClock = null;
		}
		const scoreToPlay = adjustedScore || currentScore;
		if (scoreToPlay) {
			await releaseAllKeys(scoreToPlay);
		}
		toast.info('매크로 일시정지');
	}

	async function resumeMacro() {
		if (!playbackState) {
			await playMacro();
			return;
		}
		await startPlayback(playbackState.elapsed);
	}

	async function togglePlayPause() {
		if (!currentScore) {
			toast.error('악보를 먼저 로드하세요');
			return;
		}
		if (isPlaying) {
			await pauseMacro();
			return;
		}
		if (isPaused) {
			await resumeMacro();
			return;
		}
		await playMacro();
	}

	async function stopMacro() {
		const scoreToPlay = adjustedScore || currentScore;
		isPlaying = false;
		isPaused = false;
		playbackState = null;
		playbackClock = null;
		if (scoreToPlay) {
			await releaseAllKeys(scoreToPlay);
		}
		toast.info('매크로 중지');
	}

	// keyName을 MIDI 노트 번호로 변환 (c4 -> 60)
	function keyNameToMidi(keyName: string): number | null {
		const noteNameMap: { [key: string]: number } = {
			c: 0,
			d: 2,
			e: 4,
			f: 5,
			g: 7,
			a: 9,
			b: 11
		};

		const match = keyName.match(/([a-g])(-?\d+)([b])?/);
		if (!match) return null;

		const noteName = match[1];
		const octave = parseInt(match[2]);
		const isSharp = match[3] === 'b';

		const baseNote = noteNameMap[noteName];
		if (baseNote === undefined) return null;

		const noteInOctave = baseNote + (isSharp ? 1 : 0);
		return (octave + 1) * 12 + noteInOctave;
	}

	// MIDI 번호에 음정/옥타브 조정을 적용한 keyName으로 변환
	// 조정 후 C2~C5 범위를 벗어나면 null 반환 (연주 불가)
	function midiToKeyNameWithShift(
		midi: number,
		transpose: number,
		octShift: number,
		instrumentMap: Record<string, string>
	): string | null {
		const shifted = midi + transpose + octShift * 12;

		// C2~C5 범위 체크 (36~72)
		const MIN_MIDI = 36; // c2
		const MAX_MIDI = 72; // c5

		// 범위를 벗어나면 연주 불가
		if (shifted < MIN_MIDI || shifted > MAX_MIDI) {
			return null;
		}

		return midiNoteToKeyForInstrument(shifted, instrumentMap);
	}

	// MIDI 노트 번호를 음계로 변환 (60=C4, 61=C#4/Db4, 62=D4, ...)
	function midiNoteToKeyName(midiNote: number): string | null {
		const noteNames = ['c', 'c', 'd', 'd', 'e', 'f', 'f', 'g', 'g', 'a', 'a', 'b'];
		const isSharp = [false, true, false, true, false, false, true, false, true, false, true, false];

		const noteIndex = ((midiNote % 12) + 12) % 12;
		const octave = Math.floor(midiNote / 12) - 1;

		const noteName = noteNames[noteIndex];
		const sharpPart = isSharp[noteIndex] ? 'b' : '';
		const keyName = `${noteName}${octave}${sharpPart}`;
		return keyName;
	}

	// 현재 키맵 기준으로 MIDI 노트를 keyName으로 변환
	function midiNoteToKeyForInstrument(
		midiNote: number,
		instrumentMap: Record<string, string>
	): string | null {
		const noteNames = ['c', 'c', 'd', 'd', 'e', 'f', 'f', 'g', 'g', 'a', 'a', 'b'];
		const isSharp = [false, true, false, true, false, false, true, false, true, false, true, false];

		const noteIndex = ((midiNote % 12) + 12) % 12;
		const octave = Math.floor(midiNote / 12) - 1;

		const noteName = noteNames[noteIndex];
		const sharpPart = isSharp[noteIndex] ? 'b' : '';
		const keyName = `${noteName}${octave}${sharpPart}`;

		return instrumentMap[keyName] ? keyName : null;
	}

	// transposition과 octaveShift를 적용한 악보 생성
	function createAdjustedScore(
		score: Score,
		transpose: number,
		octShift: number,
		instrumentMap: Record<string, string>
	): Score {
		const adjustedNotes: ScoreNote[] = score.notes.map((note) => {
			if (note.rest) {
				return note;
			}

			if (!note.keys || note.keys.length === 0) {
				return note;
			}

			// 각 노트의 키를 음역대 변환
			const adjustedKeys = note.keys
				.map((k) => {
					const midi = keyNameToMidi(k);
					if (midi === null) return null;
					return midiToKeyNameWithShift(midi, transpose, octShift, instrumentMap);
				})
				.filter((k): k is string => k !== null);

			// 변환 불가능한 음은 제외
			if (adjustedKeys.length === 0) {
				return { ...note, keys: undefined, rest: true };
			}

			return { ...note, keys: adjustedKeys };
		});

		return {
			...score,
			notes: adjustedNotes
		};
	}

	// transposition 또는 octaveShift 변경 시 자동으로 악보 재구성
	$: adjustedScore = currentScore
		? createAdjustedScore(currentScore, transposition, octaveShift, keyMaps[currentInstrument])
		: null;

	// 악기 또는 악보 변경 시 xdt.exe 자동 감지
	$: if (currentInstrument || currentScore) {
		detectXdtProcess();
	}

	// 현재 설정 기준 잘릴 음 계산 및 추천 옥타브
	function countClippedNotes(
		score: Score,
		transpose: number,
		octShift: number,
		instrumentMap: Record<string, string>
	): { total: number; clipped: number } {
		let total = 0;
		let clipped = 0;

		for (const note of score.notes) {
			if (note.rest || !note.keys || note.keys.length === 0) continue;
			for (const keyName of note.keys) {
				total++;
				const midi = keyNameToMidi(keyName);
				if (midi === null) {
					clipped++;
					continue;
				}
				// 자동 범위 조정 적용
				const adjustedKey = midiToKeyNameWithShift(midi, transpose, octShift, instrumentMap);
				if (!adjustedKey) clipped++;
			}
		}

		return { total, clipped };
	}

	function findBestOctaveShift(
		score: Score,
		transpose: number,
		instrumentMap: Record<string, string>
	): { shift: number; clipped: number; total: number } | null {
		let best: { shift: number; clipped: number; total: number } | null = null;
		for (let shift = -2; shift <= 2; shift++) {
			const stats = countClippedNotes(score, transpose, shift, instrumentMap);
			if (!best || stats.clipped < best.clipped) {
				best = { shift, clipped: stats.clipped, total: stats.total };
				continue;
			}
			if (best && stats.clipped === best.clipped) {
				if (Math.abs(shift) < Math.abs(best.shift)) {
					best = { shift, clipped: stats.clipped, total: stats.total };
				}
			}
		}
		return best;
	}

	$: clipStats = currentScore
		? countClippedNotes(currentScore, transposition, octaveShift, keyMaps[currentInstrument])
		: null;

	$: recommendedShift = currentScore
		? findBestOctaveShift(currentScore, transposition, keyMaps[currentInstrument])
		: null;

	// 악기 키맵의 최소/최대 MIDI 번호 계산
	function getInstrumentRange(
		instrumentMap: Record<string, string>
	): { min: number; max: number } | null {
		const midiNotes = Object.keys(instrumentMap)
			.map((k) => keyNameToMidi(k))
			.filter((m): m is number => m !== null);

		if (midiNotes.length === 0) return null;

		return {
			min: Math.min(...midiNotes),
			max: Math.max(...midiNotes)
		};
	}

	// 최적의 transposition과 octaveShift 찾기
	function findOptimalShift(
		score: Score,
		instrumentMap: Record<string, string>
	): { transpose: number; octaveShift: number; clipped: number; total: number } | null {
		const instrumentRange = getInstrumentRange(instrumentMap);
		if (!instrumentRange) return null;

		// MIDI 곡의 음역대 구하기
		let minMidi = 127;
		let maxMidi = 0;
		let totalNotes = 0;

		for (const note of score.notes) {
			if (note.rest || !note.keys || note.keys.length === 0) continue;
			for (const keyName of note.keys) {
				const midi = keyNameToMidi(keyName);
				if (midi !== null) {
					minMidi = Math.min(minMidi, midi);
					maxMidi = Math.max(maxMidi, midi);
					totalNotes++;
				}
			}
		}

		if (totalNotes === 0) return null;

		const scoreRange = maxMidi - minMidi;
		const instrumentRangeSize = instrumentRange.max - instrumentRange.min;

		// 곡의 중심 음과 악기의 중심 음을 맞추는 전략
		const scoreCenter = (minMidi + maxMidi) / 2;
		const instrumentCenter = (instrumentRange.min + instrumentRange.max) / 2;
		const centerDiff = Math.round(instrumentCenter - scoreCenter);

		// 여러 조합 시도 (전체 범위를 스캔)
		let best = null;

		for (let transpose = -12; transpose <= 12; transpose++) {
			for (let octShift = -2; octShift <= 2; octShift++) {
				const totalShift = transpose + octShift * 12;
				const shiftedMin = minMidi + totalShift;
				const shiftedMax = maxMidi + totalShift;

				// 범위 내에 들어가는 노트 수 계산
				let clipped = 0;
				for (const note of score.notes) {
					if (note.rest || !note.keys || note.keys.length === 0) continue;
					for (const keyName of note.keys) {
						const midi = keyNameToMidi(keyName);
						if (midi === null) continue;
						const shifted = midi + totalShift;
						const adjustedKey = midiNoteToKeyForInstrument(shifted, instrumentMap);
						if (!adjustedKey) clipped++;
					}
				}

				if (
					!best ||
					clipped < best.clipped ||
					(clipped === best.clipped &&
						Math.abs(transpose) + Math.abs(octShift) <
							Math.abs(best.transpose) + Math.abs(best.octaveShift))
				) {
					best = { transpose, octaveShift: octShift, clipped, total: totalNotes };
				}
			}
		}

		return best;
	}

	// 자동 음역대 조정 적용
	function applyOptimalShift() {
		if (!currentScore) return;

		const optimal = findOptimalShift(currentScore, keyMaps[currentInstrument]);
		if (!optimal) {
			toast.error('최적 음역대를 찾을 수 없습니다');
			return;
		}

		transposition = optimal.transpose;
		octaveShift = optimal.octaveShift;

		if (optimal.clipped === 0) {
			toast.success('모든 노트가 연주 가능합니다!');
		} else {
			toast.info(
				`최적 설정 적용: 반음 ${optimal.transpose}, 옥타브 ${optimal.octaveShift}\n` +
					`잘림: ${optimal.clipped}/${optimal.total}개`
			);
		}
	}

	// Score를 MIDI 파일(Uint8Array)로 변환
	async function scoreToMidiFile(score: Score): Promise<Uint8Array> {
		const midiModule = await import('@tonejs/midi');
		const { Midi } = midiModule as { Midi: typeof midiModule.Midi };

		const midi = new Midi();
		midi.header.setTempo(score.bpm);

		const track = midi.addTrack();
		track.name = score.song;
		track.channel = 0;
		track.instrument.number = 0; // Piano

		// Score의 노트를 MIDI 트랙에 추가
		for (const note of score.notes) {
			if (note.rest || !note.keys || note.keys.length === 0) continue;

			for (const keyName of note.keys) {
				const midiNote = keyNameToMidi(keyName);
				if (midiNote !== null) {
					track.addNote({
						midi: midiNote,
						time: note.startTime / 1000, // ms → seconds
						duration: (note.endTime - note.startTime) / 1000,
						velocity: 0.8
					});
				}
			}
		}

		return new Uint8Array(midi.toArray());
	}

	// 3옥타브 편곡 적용
	async function applyThreeOctaveArrangement() {
		if (!currentScore) {
			toast.error('악보를 먼저 로드하세요');
			return;
		}

		try {
			const arranged = await invoke<Score>('apply_arrangement', { score: currentScore });
			currentScore = arranged;

			// 편곡 후 조정값 초기화 (이중 변환 방지)
			transposition = 0;
			octaveShift = 0;

			// MIDI 파일도 편곡된 버전으로 업데이트
			if (currentMidiFile) {
				const arrangedMidiData = await scoreToMidiFile(arranged);
				currentMidiFile = {
					data: arrangedMidiData,
					name: currentMidiFile.name.replace('.mid', '_arranged.mid')
				};
			}

			isArranged = true; // 편곡 적용됨 표시
			toast.success('3옥타브 편곡이 적용되었습니다 (C2~C5 범위)');
		} catch (error) {
			console.error('Arrangement error:', error);
			toast.error('편곡 적용 실패');
		}
	}

	// MIDI 파일을 Score로 변환
	async function parseMidiFile(input: File | Uint8Array, fileName?: string): Promise<Score> {
		// File이면 Uint8Array로 변환, Uint8Array면 그대로 사용
		const uint8Array = input instanceof File ? new Uint8Array(await input.arrayBuffer()) : input;
		const name = input instanceof File ? input.name : fileName || 'Unknown';

		try {
			const midiModule = await import('@tonejs/midi');
			const { Midi } = midiModule as { Midi: typeof midiModule.Midi };
			const midi = new Midi(uint8Array);

			if (!midi.tracks || midi.tracks.length === 0) {
				throw new Error('No track found in MIDI file');
			}

			// 모든 트랙의 노트를 합치기 (피아노 곡은 보통 왼손/오른손이 분리됨)
			const allNotes = [];
			let trackInfo = [];

			for (const track of midi.tracks) {
				if (track.notes.length > 0) {
					allNotes.push(...track.notes);
					trackInfo.push(`${track.name || '이름없음'}: ${track.notes.length}개`);
				}
			}

			if (allNotes.length === 0) {
				throw new Error('No notes found in any track');
			}

			console.log('=== MIDI 트랙 정보 ===');
			console.log(`총 트랙 수: ${midi.tracks.length}개`);
			trackInfo.forEach((info, idx) => console.log(`  트랙 ${idx + 1}: ${info}`));
			console.log(`합친 노트 수: ${allNotes.length}개`);

			const notes: ScoreNote[] = [];
			const bpm = midi.header.tempos[0]?.bpm || 120;
			const ppq = midi.header.ppq || 480; // Pulses Per Quarter note

			// ms 단위로 변환하기 위한 계산
			const msPerQuarter = (60 / bpm) * 1000;

			// 노트를 시간순으로 정렬
			const sortedNotes = [...allNotes].sort((a, b) => a.ticks - b.ticks);

			// 동시에 시작하는 노트들을 그룹핑
			const noteGroups: Map<number, typeof sortedNotes> = new Map();
			for (const note of sortedNotes) {
				const startTick = note.ticks;
				if (!noteGroups.has(startTick)) {
					noteGroups.set(startTick, []);
				}
				noteGroups.get(startTick)!.push(note);
			}

			// 그룹을 시간순으로 정렬
			const sortedGroups = Array.from(noteGroups.entries()).sort((a, b) => a[0] - b[0]);

			let lastNoteEndTime = 0; // 마지막 노트가 완전히 끝난 시간
			let supportedNotesCount = 0;
			let clippedNotesCount = 0;
			let minMidi = 127;
			let maxMidi = 0;

			for (const [startTick, groupNotes] of sortedGroups) {
				const noteStartMs = (startTick / ppq) * msPerQuarter;

				// 쉼표 추가 (이전 노트들이 모두 끝난 후)
				if (noteStartMs > lastNoteEndTime && lastNoteEndTime > 0) {
					notes.push({
						rest: true,
						startTime: lastNoteEndTime,
						endTime: noteStartMs
					});
				}

				// 그룹의 모든 노트를 하나의 ScoreNote로 변환
				const keys: string[] = [];
				let maxEndMs = noteStartMs;

				for (const note of groupNotes) {
					minMidi = Math.min(minMidi, note.midi);
					maxMidi = Math.max(maxMidi, note.midi);

					const keyName = midiNoteToKeyName(note.midi);
					if (keyName) {
						keys.push(keyName);
					}

					const noteEndMs = ((note.ticks + note.durationTicks) / ppq) * msPerQuarter;
					maxEndMs = Math.max(maxEndMs, noteEndMs);

					// 클리핑 체크
					if (keyName) {
						const adjustedKey = midiNoteToKeyForInstrument(
							note.midi + transposition + octaveShift * 12,
							keyMaps[currentInstrument]
						);
						if (adjustedKey) {
							supportedNotesCount++;
						} else {
							clippedNotesCount++;
						}
					}
				}

				// ScoreNote 추가 (동시에 연주되는 모든 키 포함)
				if (keys.length > 0) {
					notes.push({
						keys,
						startTime: noteStartMs,
						endTime: maxEndMs
					});
				}

				// 가장 늦게 끝나는 노트의 시간을 추적
				lastNoteEndTime = Math.max(lastNoteEndTime, maxEndMs);
			}

			if (notes.length === 0) {
				throw new Error('No supported notes found in MIDI file');
			}

			const totalTime = lastNoteEndTime;

			// 통계 계산
			const restCount = notes.filter((n) => n.rest).length;
			const noteCount = notes.filter((n) => !n.rest).length;
			const totalKeyPresses = notes
				.filter((n) => !n.rest && n.keys)
				.reduce((sum, n) => sum + (n.keys?.length || 0), 0);

			// 그룹 크기 분포 분석
			const groupSizes = sortedGroups.map(([_, notes]) => notes.length);
			const maxGroupSize = Math.max(...groupSizes);
			const avgGroupSize = groupSizes.reduce((a, b) => a + b, 0) / groupSizes.length;
			const singleNoteGroups = groupSizes.filter((s) => s === 1).length;
			const multiNoteGroups = groupSizes.filter((s) => s > 1).length;

			// MIDI 파싱 결과 로그
			console.log('\n=== MIDI 파싱 결과 ===');
			console.log(`BPM: ${bpm}`);
			console.log(`원본 MIDI 노트 이벤트: ${sortedNotes.length}개`);
			console.log(`그룹화된 노트 그룹: ${sortedGroups.length}개`);
			console.log(`  - 단일 노트 그룹: ${singleNoteGroups}개`);
			console.log(`  - 화음 그룹 (2개 이상): ${multiNoteGroups}개`);
			console.log(`  - 최대 동시 노트: ${maxGroupSize}개`);
			console.log(`  - 평균 동시 노트: ${avgGroupSize.toFixed(2)}개`);
			console.log(`생성된 ScoreNote: ${notes.length}개 (노트: ${noteCount}, 쉼표: ${restCount})`);
			console.log(`실제 키 입력 횟수: ${totalKeyPresses}개 (화음 포함)`);
			console.log(`음역대: ${midiNoteToKeyName(minMidi)} ~ ${midiNoteToKeyName(maxMidi)}`);
			console.log(`지원되는 노트: ${supportedNotesCount}개`);
			console.log(`잘리는 노트: ${clippedNotesCount}개`);
			console.log(`총 재생 시간: ${Math.ceil(totalTime / 1000)}초`);

			// 샘플 노트 출력 (처음 5개)
			console.log('\n=== 샘플 노트 (처음 5개) ===');
			notes.slice(0, 5).forEach((note, idx) => {
				if (note.rest) {
					console.log(`${idx + 1}. [쉼표] ${note.startTime}ms ~ ${note.endTime}ms`);
				} else {
					const mappedKeys = note.keys
						?.map((k) => {
							const adjustedMidi = keyNameToMidi(k);
							if (!adjustedMidi) return '?';
							const shifted = adjustedMidi + transposition + octaveShift * 12;
							const adjustedKey = midiNoteToKeyForInstrument(shifted, keyMaps[currentInstrument]);
							return adjustedKey ? `${k}→${keyMaps[currentInstrument][adjustedKey]}` : `${k}→X`;
						})
						.join(', ');
					console.log(`${idx + 1}. ${note.startTime}ms ~ ${note.endTime}ms: [${mappedKeys}]`);
				}
			});

			// 클리핑 정보 표시
			if (clippedNotesCount > 0) {
				const minKeyName = midiNoteToKeyName(minMidi) || `MIDI ${minMidi}`;
				const maxKeyName = midiNoteToKeyName(maxMidi) || `MIDI ${maxMidi}`;
				toast.warning(
					`${clippedNotesCount}개 음이 현재 설정에서 잘립니다 (${minKeyName} ~ ${maxKeyName}).\n옥타브/피치 조정을 추천합니다.`
				);
			}

			return {
				song: name.replace(/\.(mid|midi)$/i, ''),
				bpm: Math.round(bpm),
				notes,
				totalTime: Math.ceil(totalTime)
			};
		} catch (error) {
			console.error('MIDI parsing error details:', error);
			throw error;
		}
	}

	// 모든 트랙을 피아노 트랙 하나로 병합
	async function mergeTracksToSinglePiano(file: File): Promise<Uint8Array> {
		const midiModule = await import('@tonejs/midi');
		const { Midi } = midiModule as { Midi: typeof midiModule.Midi };

		const uint8Array = new Uint8Array(await file.arrayBuffer());
		const midi = new Midi(uint8Array);

		// 원본 MIDI에서 트랙을 모두 제거하고 새로운 병합 트랙 추가
		const originalTrackCount = midi.tracks.length;
		const ppq = midi.header.ppq;
		const tempo = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120;

		console.log(`\n=== 트랙 병합 시작 ===`);
		console.log(`원본 트랙 수: ${originalTrackCount}개`);

		// 모든 트랙의 노트를 수집 (드럼 트랙 제외)
		const allNotes: any[] = [];
		let includedTracks = 0;
		let excludedTracks = 0;

		for (const track of midi.tracks) {
			const trackInfo = `"${track.name || '이름없음'}" (채널 ${track.channel}, 악기 ${track.instrument.number})`;

			// 드럼 채널(9번, 0-indexed) 제외
			if (track.channel === 9) {
				console.log(`  ⊗ 제외: ${trackInfo} - 드럼 트랙`);
				excludedTracks++;
				continue;
			}

			// 노트가 없는 트랙 제외
			if (track.notes.length === 0) {
				console.log(`  ⊗ 제외: ${trackInfo} - 노트 없음`);
				excludedTracks++;
				continue;
			}

			console.log(`  ✓ 포함: ${trackInfo} - ${track.notes.length}개 노트`);
			includedTracks++;

			for (const note of track.notes) {
				allNotes.push({
					midi: note.midi,
					time: note.time,
					duration: note.duration,
					velocity: note.velocity
				});
			}
		}

		// 노트를 시간순으로 정렬
		allNotes.sort((a, b) => a.time - b.time);

		// 기존 트랙 제거
		midi.tracks.length = 0;

		// 새 피아노 트랙 생성
		const pianoTrack = midi.addTrack();
		pianoTrack.name = 'Piano (Merged)';
		pianoTrack.channel = 0;
		pianoTrack.instrument.number = 0; // Piano

		// 정렬된 노트 추가
		for (const note of allNotes) {
			pianoTrack.addNote({
				midi: note.midi,
				time: note.time,
				duration: note.duration,
				velocity: note.velocity
			});
		}

		console.log(`\n트랙 병합 완료:`);
		console.log(
			`  원본: ${originalTrackCount}개 트랙 (포함 ${includedTracks}개, 제외 ${excludedTracks}개)`
		);
		console.log(`  결과: 1개 피아노 트랙 (${allNotes.length}개 노트)`);

		// MIDI 파일을 Uint8Array로 변환
		return new Uint8Array(midi.toArray());
	}

	// MIDI 파일 업로드 핸들러
	async function handleMidiUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) {
			toast.error('파일을 선택하세요');
			return;
		}

		const loadingToast = toast.loading('MIDI 파일 분석 중...');

		try {
			// 모든 트랙을 피아노로 병합
			const mergedData = await mergeTracksToSinglePiano(file);
			currentMidiFile = {
				data: mergedData,
				name: file.name
			};

			// 병합된 MIDI 데이터를 파싱
			currentScore = await parseMidiFile(mergedData, file.name);

			// 실제 노트 개수 계산 (쉼표 제외)
			const actualNoteCount = currentScore.notes.filter((n) => !n.rest).length;
			const totalKeyPresses = currentScore.notes
				.filter((n) => !n.rest && n.keys)
				.reduce((sum, n) => sum + (n.keys?.length || 0), 0);

			isArranged = false; // 새 파일 로드 시 편곡 플래그 초기화
			toast.dismiss(loadingToast);
			toast.success(
				`악보 로드: ${currentScore.song}\n노트 그룹: ${actualNoteCount}개, 총 키 입력: ${totalKeyPresses}개\n(모든 멜로디 트랙이 피아노로 병합됨, 드럼 제외)`
			);
			// 파일 input 리셋
			input.value = '';

			// xdt.exe 자동 감지 (heartopia일 때)
			await detectXdtProcess();
		} catch (error) {
			toast.dismiss(loadingToast);
			console.error('MIDI parsing error:', error);
			const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
			console.log('Full error:', JSON.stringify(error, null, 2));
			toast.error(`MIDI 파일 분석 실패: ${errorMsg}`);
		}
	}

	// MIDI 파일 다운로드
	async function downloadMidiFile() {
		if (!currentMidiFile) {
			toast.error('다운로드할 MIDI 파일이 없습니다');
			return;
		}

		if (!tauriReady) {
			toast.error('Tauri API를 로드하지 못했습니다');
			return;
		}

		try {
			const filePath = await save({
				defaultPath: currentMidiFile.name,
				filters: [
					{
						name: 'MIDI Files',
						extensions: ['mid', 'midi']
					}
				]
			});

			if (!filePath) return; // 사용자가 취소한 경우

			await writeFile(filePath, currentMidiFile.data);
			toast.success(`파일이 저장되었습니다: ${filePath}`);
		} catch (error) {
			console.error('Download error:', error);
			toast.error('파일 다운로드 실패');
		}
	}
</script>

<div
	class="tauri-theme container mx-auto flex h-screen flex-col space-y-4 bg-background p-4 text-foreground select-none"
	on:contextmenu|preventDefault
	on:dragstart|preventDefault
>
	<Card.Root class="flex flex-1 flex-col overflow-hidden">
		<Card.Content class="flex flex-1 flex-col overflow-hidden">
			<div class="flex-1 space-y-4 overflow-y-auto">
				<!-- MIDI 파일 업로드 -->
				<div class="space-y-2">
					<Label>MIDI 파일</Label>
					<div class="flex items-center gap-3">
						<label for="midi-upload" class="flex-shrink-0">
							<input
								id="midi-upload"
								type="file"
								accept=".mid,.midi"
								on:change={handleMidiUpload}
								disabled={isPlaying}
								class="hidden"
							/>
							<span
								class="inline-block cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 {isPlaying
									? 'cursor-not-allowed opacity-50'
									: ''}"
							>
								파일 선택
							</span>
						</label>
						{#if currentScore}
							{@const actualNotes = currentScore.notes.filter((n) => !n.rest).length}
							{@const totalKeys = currentScore.notes
								.filter((n) => !n.rest && n.keys)
								.reduce((sum, n) => sum + (n.keys?.length || 0), 0)}
							<div class="text-sm text-foreground">
								<p class="font-medium">{currentScore.song}</p>
								<p class="text-xs text-muted-foreground">
									BPM: {currentScore.bpm} · 노트 그룹: {actualNotes}개 · 총 키 입력: {totalKeys}개
								</p>
							</div>
						{:else}
							<div class="text-sm text-muted-foreground">
								<p class="font-medium">선택된 파일 없음</p>
							</div>
						{/if}
					</div>
				</div>

				<!-- 음역대 조정 -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<Label>음역대 조정</Label>
						<div class="flex gap-2">
							{#if currentScore}
								<Button
									onclick={applyOptimalShift}
									variant="outline"
									size="sm"
									disabled={isPlaying}
								>
									자동 조정
								</Button>
								<Button
									onclick={applyThreeOctaveArrangement}
									variant="outline"
									size="sm"
									disabled={isPlaying}
								>
									3옥타브 편곡
								</Button>
							{/if}
						</div>
					</div>
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<label class="text-sm font-medium">반음</label>
							<span class="text-xs text-muted-foreground"
								>{transposition > 0 ? '+' : ''}{transposition}</span
							>
						</div>
						<input
							id="transposition"
							type="range"
							min="-12"
							max="12"
							value={transposition}
							on:change={(e) => (transposition = parseInt(e.currentTarget.value))}
							disabled={isPlaying}
							class="w-full"
						/>
						<p class="text-xs text-muted-foreground">원본 악보를 반음 단위로 올리거나 내립니다</p>
					</div>

					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<label class="text-sm font-medium">옥타브 이동</label>
							<span class="text-xs text-muted-foreground"
								>{octaveShift > 0 ? '+' : ''}{octaveShift}</span
							>
						</div>
						<input
							id="octave-shift"
							type="range"
							min="-2"
							max="2"
							value={octaveShift}
							on:change={(e) => (octaveShift = parseInt(e.currentTarget.value))}
							disabled={isPlaying}
							class="w-full"
						/>
						<p class="text-xs text-muted-foreground">원본 악보를 옥타브 단위로 올리거나 내립니다</p>
						{#if clipStats}
							<p class="text-xs text-muted-foreground">
								연주 불가 음: {clipStats.clipped} / {clipStats.total} (C2~C5 범위 밖)
							</p>
							{#if recommendedShift}
								{#if recommendedShift.shift !== octaveShift}
									<p class="text-xs text-foreground">
										추천 옥타브: {recommendedShift.shift > 0 ? '+' : ''}{recommendedShift.shift}
										(잘림 {recommendedShift.clipped}/{recommendedShift.total})
									</p>
								{:else}
									<p class="text-xs text-muted-foreground">
										현재 설정이 최적입니다 (잘림 {recommendedShift.clipped}/{recommendedShift.total})
									</p>
								{/if}
							{/if}
						{/if}
					</div>
				</div>

				<!-- 게임 감지 상태 (heartopia 전용) -->
				{#if currentInstrument === 'heartopia'}
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<Label>게임 감지</Label>
							<Button
								onclick={detectXdtProcess}
								variant="outline"
								size="sm"
								disabled={isPlaying || isDetectingProcess}
							>
								{isDetectingProcess ? '감지 중...' : '새로고침'}
							</Button>
						</div>
						{#if processDetected}
							<div
								class="rounded-md border border-accent/40 bg-accent/20 p-3 text-sm text-accent-foreground"
							>
								✓ 준비되었습니다.
							</div>
						{:else}
							<div
								class="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground"
							>
								⚠ 두근두근타운을 실행해주세요.
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- 매크로 제어 -->
			<div class="mt-4 flex justify-between gap-2 border-t pt-4">
				<div class="flex justify-start gap-2">
					{#if isArranged}
						<Button variant="outline" size="sm" onclick={downloadMidiFile}>
							편곡된 MIDI 다운로드
						</Button>
					{/if}
				</div>
				<div class="flex justify-end gap-2">
					<Button
						onclick={playMacro}
						disabled={!currentScore || isPlaying || !processDetected}
						variant="default"
					>
						{isPlaying ? '재생 중...' : '재생'}
					</Button>
					<Button onclick={stopMacro} disabled={!isPlaying} variant="destructive">중지</Button>
				</div>
			</div>
		</Card.Content>
	</Card.Root>
</div>
