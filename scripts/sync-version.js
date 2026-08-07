'use strict';

import('./sync-version.mjs').catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
