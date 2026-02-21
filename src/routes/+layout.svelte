<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.png';
	import { Toaster } from '$lib/components/ui/sonner/index.js';

	let { children } = $props();
	const siteUrl = 'https://aciddust.github.io/ddt-piano';
	const ogImageUrl =
		'https://raw.githubusercontent.com/aciddust/ddt-piano/refs/heads/main/docs/example/og.png?v=1';
</script>

<Toaster
	theme="light"
	toastOptions={{
		style: 'max-width: 400px; white-space: pre-line;'
	}}
/>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="description" content="두두타 피아노 연주. 이제 어렵지 않아요" />

	<!-- Open Graph -->
	<meta property="og:title" content="두두타 피아노" />
	<meta property="og:description" content="두두타 피아노 연주. 이제 어렵지 않아요" />
	<meta property="og:image" content={ogImageUrl} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={siteUrl} />
	<meta property="og:site_name" content="두두타 피아노" />

	<meta property="twitter:title" content="두두타 피아노" />
	<meta property="twitter:description" content="두두타 피아노 연주. 이제 어렵지 않아요" />
	<meta property="twitter:description" content="두두타 피아노 연주. 이제 어렵지 않아요" />
	<meta property="twitter:image" content={ogImageUrl} />

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
