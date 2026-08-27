const fs = require('node:fs');
const path = require('node:path');

module.exports = async function afterPack(context) {
  const source = path.join(context.packager.projectDir, 'api-enhanced');
  const destination = path.join(context.appOutDir, 'resources', 'app', 'api-enhanced');

  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (entry) => {
      const relative = path.relative(source, entry);
      return !relative.startsWith('.git') &&
        !relative.startsWith('.github') &&
        !relative.startsWith('.husky') &&
        !relative.startsWith('precompiled');
    },
  });
};
