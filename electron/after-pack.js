const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  const appOutDir = context.appOutDir;
  const resourcesDir = path.join(appOutDir, 'resources');

  const folders = ['backend-deployed', 'frontend-deployed'];
  const electronDir = __dirname;

  for (const folder of folders) {
    const src = path.join(electronDir, folder);
    const dest = path.join(resourcesDir, folder);

    if (!fs.existsSync(src)) {
      throw new Error('afterPack: source folder missing: ' + src);
    }

    console.log('[afterPack] copying ' + folder + ' -> ' + dest);
    fs.cpSync(src, dest, { recursive: true, force: true });

    if (folder === 'frontend-deployed') {
      const nextBin = path.join(dest, 'node_modules', 'next', 'dist', 'bin', 'next');
      if (!fs.existsSync(nextBin)) {
        throw new Error('afterPack: next binary missing after copy: ' + nextBin);
      }
    }
    if (folder === 'backend-deployed') {
      const serverJs = path.join(dest, 'dist', 'server.js');
      if (!fs.existsSync(serverJs)) {
        throw new Error('afterPack: server.js missing after copy: ' + serverJs);
      }
    }
  }
};