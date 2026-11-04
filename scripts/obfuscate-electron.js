const fs = require('node:fs');
const path = require('node:path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const projectDirectory = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(projectDirectory, '.env') });
const sourceDirectory = path.join(projectDirectory, 'electron');
const outputDirectory = path.join(projectDirectory, 'electron-obfuscated');
const licenseTimeUrl = String(process.env.FOX_LICENSE_TIME_URL || '').trim();

if (licenseTimeUrl) {
  let parsedLicenseTimeUrl;
  try {
    parsedLicenseTimeUrl = new URL(licenseTimeUrl);
  } catch {
    throw new Error('FOX_LICENSE_TIME_URL must be a valid HTTPS URL');
  }
  if (parsedLicenseTimeUrl.protocol !== 'https:' || parsedLicenseTimeUrl.username || parsedLicenseTimeUrl.password) {
    throw new Error('FOX_LICENSE_TIME_URL must use HTTPS and must not contain credentials');
  }
}

function copyAndObfuscate(sourcePath, outputPath) {
  const entries = fs.readdirSync(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    const sourceEntryPath = path.join(sourcePath, entry.name);
    const outputEntryPath = path.join(outputPath, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(outputEntryPath, { recursive: true });
      copyAndObfuscate(sourceEntryPath, outputEntryPath);
      continue;
    }

    if (!entry.isFile() || entry.name.toLowerCase().endsWith('.log')) {
      continue;
    }

    if (entry.name.endsWith('.js') && entry.name !== 'JsBarcode.all.min.js') {
      const source = fs.readFileSync(sourceEntryPath, 'utf8');
      const result = JavaScriptObfuscator.obfuscate(source, {
        compact: true,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,
        selfDefending: false,
        stringArray: true,
        stringArrayThreshold: 0.5,
        target: 'node',
      });

      fs.writeFileSync(outputEntryPath, result.getObfuscatedCode(), 'utf8');
      continue;
    }

    fs.copyFileSync(sourceEntryPath, outputEntryPath);
  }
}

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });
copyAndObfuscate(sourceDirectory, outputDirectory);
fs.writeFileSync(
  path.join(projectDirectory, 'license-time.config.json'),
  JSON.stringify({ url: licenseTimeUrl }),
  'utf8'
);
