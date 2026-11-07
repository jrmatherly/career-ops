import { readConfig, createServer } from './server.mjs';

const config = readConfig(process.env);
createServer(config).listen(config.port, config.bind, () => console.log(`publish listening on http://${config.bind}:${config.port}`));
