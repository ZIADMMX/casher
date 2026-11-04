const { app } = require('electron');

require(app.isPackaged ? './electron-obfuscated/main.js' : './electron/main.js');
