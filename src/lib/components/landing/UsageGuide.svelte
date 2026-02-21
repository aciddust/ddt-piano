<script lang="ts">
	import { onMount } from 'svelte';
	import { PLACEHOLDER_IMAGES, MIDI_SOURCES } from '$lib/constants';
	import { FileMusic, SquareArrowOutUpRight, SquarePen } from '@lucide/svelte';

	let videoElement = $state<HTMLVideoElement>();
	let isVideoLoaded = $state(false);
	let isPlaying = $state(false);

	function handleVideoLoaded() {
		isVideoLoaded = true;
		if (videoElement) {
			videoElement.play().catch((error) => {
				console.log('Auto-play prevented:', error);
			});
			isPlaying = true;
		}
	}

	function togglePlayPause() {
		if (!videoElement) return;

		if (videoElement.paused) {
			videoElement.play();
			isPlaying = true;
		} else {
			videoElement.pause();
			isPlaying = false;
		}
	}

	onMount(() => {
		if (videoElement) {
			videoElement.load();
		}
	});
</script>

<section id="usage" class="border-t border-gray-800 bg-cardbg py-24">
	<div class="container mx-auto max-w-6xl px-6">
		<div class="mb-20 text-center">
			<h2 class="mb-6 text-3xl font-bold text-white md:text-4xl">사용 방법</h2>
			<p class="mx-auto mb-4 max-w-2xl break-keep text-gray-400">
				프로그램이 준비되었다면 사용방법을 알아볼까요?
			</p>
			<p class="mx-auto max-w-2xl break-keep text-gray-400">
				연주를 위한 악보와 어느정도 튜닝이 필요하지만 어렵지 않습니다.
			</p>
		</div>

		<div class="grid gap-8 md:grid-cols-2 lg:gap-12">
			<!-- Step 1 -->
			<div
				class="rounded-2xl border border-gray-800 bg-darkbg p-8 transition-colors hover:border-gray-600"
			>
				<div
					class="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-800 text-ddt"
				>
					<FileMusic class="h-6 w-6" />
				</div>
				<h3 class="mb-4 text-xl font-bold text-white">1. 악보 준비</h3>
				<div>
					<p class="mb-4 break-keep text-gray-400">두두타피아노는 MIDI 악보를 지원합니다.</p>
					<p class="mb-6 break-keep text-gray-400">
						직접 작성할 수도 있지만, 온라인에서 원하는 곡의 MIDI 악보를 다운로드하는 것이 더
						쉽습니다.
					</p>
				</div>
				<div class="overflow-hidden rounded-lg border border-gray-800">
					<!-- MIDI_SOURCES 의 내용을 참조해서 -->
					{#each MIDI_SOURCES as source}
						<a href={source.url} target="_blank" class="flex items-center justify-between gap-4 p-4 hover:bg-gray-800/30 transition-colors">
							<div class="flex-1">
								<div class="text-gray-400 hover:text-white font-medium">{source.name}</div>
								<div class="text-xs text-gray-500 mt-1">{source.description}</div>
							</div>
							<SquareArrowOutUpRight class="h-4 w-4 flex-shrink-0 text-gray-400" />
						</a>
					{/each}
				</div>
			</div>

			<!-- Step 2 -->
			<div
				class="rounded-2xl border border-gray-800 bg-darkbg p-8 transition-colors hover:border-gray-600"
			>
				<div
					class="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-800 text-ddt"
				>
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none" />
					</svg>
				</div>
				<h3 class="mb-4 text-xl font-bold text-white">2. 파일 불러오기 및 설정</h3>
				<div>
					<p class="mb-4 break-keep text-gray-400">
						MIDI 악보가 준비되었다면, 프로그램에서 해당 파일을 불러옵니다.
					</p>
					<p class="mb-4 break-keep text-gray-400">
						편곡기능 사용시 1개의 피아노 트랙으로 병합되며, 튜닝은 기본적으로 두두타 피아노에 맞춰져 있습니다.
					</p>
					<p class="mb-6 break-keep text-gray-400">
						대부분의 경우는 3옥타브 편곡과 자동조정으로 나쁘지않은 연주경험을 얻을 수 있지만 필요한경우 수동으로 조정할 수 있습니다.
					</p>
				</div>

				<div class="overflow-hidden rounded-lg border border-gray-800">
					<img src={PLACEHOLDER_IMAGES.usage1} alt="Popup Usage" class="w-full" loading="lazy" />
				</div>
			</div>

			<!-- Tip (편곡관련) -->
			<div
				class="rounded-2xl border border-gray-800 bg-darkbg p-8 transition-colors hover:border-gray-600 md:col-span-2"
			>
				<div class="mb-8 text-center">
					<div
						class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gray-800 text-ddt"
					>
						<SquarePen class="h-6 w-6" />
					</div>
					<h3 class="mb-3 text-2xl font-bold text-white">수동 조정은 어떻게하나요?</h3>
					<p class="mx-auto max-w-2xl break-keep text-gray-400">
						<a href="https://signalmidi.app/edit" target="_blank" class="text-ddt underline">Signal</a>&nbsp;같은 온라인 에디터를 사용해도 괜찮습니다.
					</p>
				</div>
			</div>

			<!-- Step 3 (usage example with video) -->
			<div
				class="rounded-2xl border border-gray-800 bg-darkbg p-8 transition-colors hover:border-gray-600 md:col-span-2"
			>
				<div class="mb-8 text-center">
					<div
						class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gray-800 text-ddt"
					>
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none" />
						</svg>
					</div>
					<h3 class="mb-3 text-2xl font-bold text-white">3. 실제 사용 예시</h3>
					<p class="mx-auto max-w-2xl break-keep text-gray-400">
						영상을 통해 두두타 피아노의 실제 동작을 확인하세요
					</p>
				</div>

				<!-- Video Demo -->
				<div class="mx-auto max-w-4xl">
					<div
						class="group relative overflow-hidden rounded-xl border border-gray-800 bg-black shadow-2xl"
						style="aspect-ratio: 16/9;"
					>
						<!-- Fake Browser Header -->
						<div
							class="relative z-10 flex h-10 items-center gap-2 border-b border-gray-800 bg-gray-900/50 px-4"
						>
							<div class="h-3 w-3 rounded-full bg-red-500/30"></div>
							<div class="h-3 w-3 rounded-full bg-yellow-500/30"></div>
							<div class="h-3 w-3 rounded-full bg-green-500/30"></div>
							<div class="ml-4 h-5 w-2/3 rounded-md bg-gray-800/50"></div>
						</div>

						<!-- Video Content Area -->
						<div class="relative bg-black" style="height: calc(100% - 2.5rem);">
							<video
								bind:this={videoElement}
								autoplay
								loop
								muted
								playsinline
								preload="auto"
								onloadeddata={handleVideoLoaded}
								oncanplay={handleVideoLoaded}
								class="h-full w-full object-cover transition-opacity duration-500"
								style="opacity: {isVideoLoaded ? '1' : '0'};"
							>
								<source src={PLACEHOLDER_IMAGES.video2} type="video/mp4" />
								<track kind="captions" />
							</video>

							<!-- Loading overlay -->
							{#if !isVideoLoaded}
								<div
									class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-black"
								>
									<div class="text-center">
										<div class="relative mx-auto mb-4 h-20 w-20">
											<div
												class="absolute inset-0 animate-pulse rounded-full bg-ddt/20 blur-xl"
											></div>
											<div
												class="relative flex h-20 w-20 items-center justify-center rounded-full border border-gray-700 bg-gray-800"
											>
												<svg
													viewBox="0 0 24 24"
													fill="none"
													class="h-10 w-10 animate-pulse text-ddt"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
												>
													<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none" />
												</svg>
											</div>
										</div>
										<p class="text-sm text-gray-500">영상 로딩 중...</p>
									</div>
								</div>
							{/if}

							<!-- Play button overlay (appears on hover when video is loaded) -->
							{#if isVideoLoaded}
								<button
									onclick={togglePlayPause}
									class="group/play absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-300 hover:bg-black/30"
								>
									<div
										class="flex h-16 w-16 items-center justify-center rounded-full bg-ddt/90 opacity-0 shadow-lg transition-opacity duration-300 group-hover/play:opacity-100"
									>
										<svg
											viewBox="0 0 24 24"
											fill="none"
											class="h-8 w-8 text-black"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											{#if !isPlaying}
												<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none" />
											{:else}
												<rect x="6" y="4" width="4" height="16" fill="currentColor" />
												<rect x="14" y="4" width="4" height="16" fill="currentColor" />
											{/if}
										</svg>
									</div>
								</button>
							{/if}
						</div>

						<!-- Hover gradient overlay -->
						<div
							class="pointer-events-none absolute inset-0 bg-gradient-to-t from-ddt/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
						></div>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>
