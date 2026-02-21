<script lang="ts">
	import StepCard from './StepCard.svelte';
	import { APP_INFO, PLACEHOLDER_IMAGES } from '$lib/constants';
	import { downloadDir } from '@tauri-apps/api/path';

	let activeTab: 'x64_window' | 'universal' = 'x64_window';
</script>

<section id="install" class="bg-darkbg py-20">
	<div class="container mx-auto max-w-5xl px-6">
		<div class="mb-16">
			<h2 class="mb-4 text-3xl font-bold text-white md:text-4xl">설치 방법</h2>
		</div>

		<!-- 탭 버튼 -->
		<div class="mb-8 flex gap-4 border-b border-gray-700">
			<button
				class="px-6 py-3 font-semibold transition-colors {activeTab === 'x64_window'
					? 'border-b-2 border-ddt text-ddt'
					: 'text-gray-400 hover:text-white'}"
				onclick={() => (activeTab = 'x64_window')}
			>
				Windows (x64)
			</button>
		</div>

		<!-- x64 설치 -->
		<div class="space-y-0">
			<StepCard number={1} title="다운로드">
				{#snippet description()}
					<span class="flex flex-col items-start gap-2">
						<p>아래 버튼을 클릭하여 Windows (x64) 버전을 다운로드하세요.</p>
						<a
							href={APP_INFO.downloadLink}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-2 rounded-lg border-2 border-ddt px-4 py-2 font-semibold text-ddt transition-all hover:bg-ddt/20"
						>
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
								<polyline points="15 3 21 3 21 9" />
								<line x1="10" y1="14" x2="21" y2="3" />
							</svg>
							Windows (x64) 버전 다운로드
						</a>
					</span>
				{/snippet}
			</StepCard>

			<StepCard
				number={2}
				title="프로그램 실행"
				description="다운로드한 파일을 실행하여 설치합니다."
				isLast={true}
			/>

			<div class="gap-4">
				<p>첫 실행 시 Windows SmartScreen에서 보안 경고가 나타날 수 있습니다.</p>
				<p>'추가 정보'를 클릭한 후 '실행'을 선택하여 계속 진행하세요.</p>
			</div>
		</div>
	</div>
</section>
