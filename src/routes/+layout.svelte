<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.png';
	import { Toaster } from '$lib/components/ui/sonner/index.js';

	let { children } = $props();
</script>

<Toaster
	theme="light"
	toastOptions={{
		style: 'max-width: 400px; white-space: pre-line;'
	}}
/>

<svelte:head>
	<link rel="icon" href={favicon} />

	{@html `
		<script type="application/ld+json">
		{
				"@context": "https://schema.org",
				"@type": "SoftwareApplication",
				"name": "두두타 피아노",
				"applicationCategory": "Application",
				"description": "두두타 피아노 연주. 이제 어렵지 않아요",
				"operatingSystem": "Windows x64",
				"offers": {
						"@type": "Offer",
						"price": "0",
						"priceCurrency": "KRW"
				}
		}
		<\/script>
	`}
</svelte:head>

{@render children?.()}
