import { resolve } from 'node:path';
import { readConfig, createServer } from './server.mjs';

const config = readConfig(process.env);
const server = createServer(config);
server.listen(config.port, config.bind, () => console.log(`publish listening on http://${config.bind}:${server.address().port}, database ${resolve(config.dbPath)}`));
