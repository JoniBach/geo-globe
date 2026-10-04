<!--
  The whole app: the globe filling the window, the card with search and settings, the time of day
  along the bottom, and the credits. A place in the address (?lat=…&lon=…&name=…) opens there.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { App } from '$lib/app.svelte';
	import Globe from '$lib/globe/Globe.svelte';
	import Credits from '$lib/ui/Credits.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import TimeDock from '$lib/ui/TimeDock.svelte';

	const app = new App();

	onMount(() => {
		const spot = App.fromUrl();
		if (spot) app.go(spot);
	});
</script>

<svelte:head>
	<title>{app.loaded ? `${app.loaded.spot.name} · Geo Globe` : 'Geo Globe'}</title>
</svelte:head>

<main>
	<Globe {app} />
	<Panel {app} />
	{#if app.loaded}<TimeDock {app} />{/if}
	<Credits {app} />
</main>

<style>
	main {
		position: fixed;
		inset: 0;
		overflow: hidden;
	}
</style>
