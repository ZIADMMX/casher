// Keeps the trial marker (electron/services/license.service.js) out of the real home folder.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.FOX_TRIAL_MARKER_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fox-trial-marker-'));
