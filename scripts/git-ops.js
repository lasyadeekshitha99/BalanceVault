import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'fs';
import path from 'path';

const dir = process.cwd();

async function initAndCommit() {
  console.log('🚀 Initializing Git repository with isomorphic-git...');
  await git.init({ fs, dir, defaultBranch: 'main' });
  console.log('✓ Git repository initialized.');

  // Read all files ignoring node_modules, dist, .git
  const filesToIgnore = new Set(['node_modules', 'dist', '.git', '.env']);
  
  function getFiles(currentDir, relativePath = '') {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    let fileList = [];
    for (const entry of entries) {
      if (filesToIgnore.has(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        fileList = fileList.concat(getFiles(fullPath, relPath));
      } else {
        fileList.push(relPath);
      }
    }
    return fileList;
  }

  const files = getFiles(dir);
  console.log(`📦 Staging ${files.length} project files...`);

  for (const filepath of files) {
    await git.add({ fs, dir, filepath });
  }

  console.log('✓ All files staged.');

  const sha = await git.commit({
    fs,
    dir,
    message: 'feat: Initial commit of BalanceVault — money movement with a ledger you can prove',
    author: {
      name: 'BalanceVault Developer',
      email: 'dev@balancevault.internal'
    }
  });

  console.log(`✅ Initial commit created! SHA: ${sha}`);
  console.log(`Branch: main`);
}

async function pushToRemote(remoteUrl, token) {
  if (!remoteUrl) {
    console.error('❌ Please supply a remote URL (e.g. https://github.com/username/repo.git)');
    return;
  }

  console.log(`🌐 Pushing to ${remoteUrl}...`);
  await git.addRemote({
    fs,
    dir,
    remote: 'origin',
    url: remoteUrl,
    force: true
  });

  const pushResult = await git.push({
    fs,
    http,
    dir,
    remote: 'origin',
    ref: 'main',
    onAuth: () => ({ username: token || 'git', password: '' })
  });

  console.log('🎉 Successfully pushed to GitHub!', pushResult);
}

const action = process.argv[2] || 'commit';
if (action === 'commit') {
  initAndCommit().catch(console.error);
} else if (action === 'push') {
  const remoteUrl = process.argv[3];
  const token = process.argv[4];
  pushToRemote(remoteUrl, token).catch(console.error);
}
