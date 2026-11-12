// Basecamp OAuth + read-only card table proxy. Logic in src/basecamp/oauth-core.js (tested in tests/basecamp.test.js).
import { handle } from '../../src/basecamp/oauth-core.js';

export const config = { path: ['/api/basecamp/*'] };

export default (req) => handle(req, process.env);
