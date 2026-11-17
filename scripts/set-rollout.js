// Sets the staged-rollout share in an electron-updater latest.yml.
// electron-updater hands the update only to installs whose stable random id falls under stagingPercentage:
// 10 = about one install in ten, 0 = paused for everyone who has not updated yet, 100 = everyone.
// Usage: node scripts/set-rollout.js <latest.yml> <0-100>
const fs = require('node:fs');

function setStagingPercentage(yaml, percent) {
  const value = Number(percent);
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error('النسبة لازم تكون رقم صحيح من 0 إلى 100');
  const kept = String(yaml).replace(/\r\n/g, '\n').split('\n').filter((line) => !/^stagingPercentage:/.test(line));
  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  if (value < 100) kept.push(`stagingPercentage: ${value}`); // no line = everyone
  return `${kept.join('\n')}\n`;
}

if (require.main === module) {
  const [file, percent] = process.argv.slice(2);
  if (!file || percent === undefined) {
    console.error('Usage: node scripts/set-rollout.js <latest.yml> <0-100>');
    process.exit(1);
  }
  fs.writeFileSync(file, setStagingPercentage(fs.readFileSync(file, 'utf8'), percent));
  console.log(`${file}: rollout ${percent}%`);
}

module.exports = { setStagingPercentage };
