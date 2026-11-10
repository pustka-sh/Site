import { createApplication } from './app.mjs';

process.umask(0o077);
const runtime = await createApplication();
const server = runtime.app.listen(runtime.config.port, runtime.config.host, () => console.log(`pustka listening on port ${runtime.config.port}`));
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
const jobs = [];
const refresh = () => Promise.resolve().then(() => runtime.content.requestSync()).catch(() => console.error('Docs refresh deferred; using the last successful snapshot.'));
if (runtime.config.syncEnabled) {
  if (runtime.config.syncOnStart) jobs.push(setTimeout(refresh, 2000));
  if (runtime.config.syncMinutes) jobs.push(setInterval(refresh, runtime.config.syncMinutes * 60000));
}
jobs.push(setInterval(() => runtime.store.prune(), 3600000));
jobs.forEach(job => job.unref());
let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  jobs.forEach(clearInterval);
  const timeout = setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => {await runtime.close();clearTimeout(timeout);process.exit(0);});
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
