'use strict';

import('./verify-version.mjs').catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
