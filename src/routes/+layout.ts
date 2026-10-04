// A client-side app: WebGL, the browser's own fetches, nothing to render on a server. The one page
// is prerendered as an empty shell, so the build is plain static files that can be hosted anywhere.
export const ssr = false;
export const prerender = true;
