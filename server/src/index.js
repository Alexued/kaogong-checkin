const { createKgcServer, PROTOCOL_VERSION } = require('./server');

function environmentFlag(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function optionalPort(value) {
  return value === undefined || value === '' ? undefined : Number(value);
}

function createServerFromEnvironment(environment = process.env) {
  const httpPort = optionalPort(environment.KGC_HTTP_PORT);
  return createKgcServer({
    httpHost: environment.KGC_HTTP_HOST || undefined,
    httpPort,
    httpPortEnd: optionalPort(environment.KGC_HTTP_PORT_END) ?? httpPort,
    udpPort: optionalPort(environment.KGC_UDP_PORT),
    dataDir: environment.KGC_DATA_DIR || undefined,
    webDir: environment.KGC_WEB_DIR || undefined,
    updateDir: environment.KGC_UPDATE_DIR || undefined,
    allowLegacy: environmentFlag(environment.KGC_ALLOW_LEGACY),
  });
}

async function runCli() {
  const service = createServerFromEnvironment();
  const status = await service.start();

  console.log(`[auth] protocol version: ${PROTOCOL_VERSION}`);
  if (status.pairingRequired) {
    console.log(`[auth] pairing code: ${service.getPairingCode()}`);
  }

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] received ${signal}; closing`);
    try {
      await service.close();
      process.exitCode = 0;
    } catch (error) {
      console.error('[server] shutdown failed:', error);
      process.exitCode = 1;
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  return service;
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error('[server] failed to start:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  PROTOCOL_VERSION,
  createKgcServer,
  createServerFromEnvironment,
  runCli,
};
