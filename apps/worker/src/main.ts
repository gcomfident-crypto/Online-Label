import { pathToFileURL } from 'node:url';

import { startWorkerRuntime } from './queues.ts';

export function main() {
  return startWorkerRuntime();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
