<!--
  The place you searched for: a map pin standing on the ground at the centre of the globe.
  In the land's group (local metres): sized from the radius, so it looks the same on any globe.
-->
<script lang="ts">
	import { T } from '@threlte/core';

	let { radius, ground, exaggeration }: { radius: number; ground: number; exaggeration: number } = $props();

	const s = $derived(radius / 1800); // the globe is 1800 scene units across, whatever the radius
</script>

<!-- the group undoes the land's vertical exaggeration, so the pin keeps its shape -->
<T.Group position={[0, ground * exaggeration, 0]} scale={[s, s, s]}>
	<T.Mesh position.y={45}>
		<T.CylinderGeometry args={[2.2, 0.6, 90, 12]} />
		<T.MeshStandardMaterial color="#5b4a3c" roughness={0.6} />
	</T.Mesh>
	<T.Mesh position.y={96}>
		<T.SphereGeometry args={[16, 24, 16]} />
		<T.MeshStandardMaterial color="#c2562d" roughness={0.45} emissive="#c2562d" emissiveIntensity={0.25} />
	</T.Mesh>
	<!-- where it touches the ground -->
	<T.Mesh position.y={0.5} rotation.x={-Math.PI / 2}>
		<T.RingGeometry args={[6, 12, 32]} />
		<T.MeshBasicMaterial color="#c2562d" transparent opacity={0.6} depthWrite={false} />
	</T.Mesh>
</T.Group>
