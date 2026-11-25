export default { async fetch(request, env) {
  if (new URL(request.url).pathname.startsWith('/api/')) {
    if (!env.MONITOR) return Response.json({error:'Le service de surveillance n’est pas encore connecté.'},{status:503});
    try { return await env.MONITOR.fetch(request); }
    catch { return Response.json({error:'Service temporairement indisponible.'},{status:503}); }
  }
  return env.ASSETS.fetch(request);
}};
