import { pathToFileURL } from 'node:url';

import { startWorker } from './queues.ts';

export function main() {
  return startWorker();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
