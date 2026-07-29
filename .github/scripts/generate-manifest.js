import fs from 'node:fs';

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const releaseId = process.env.RELEASE_ID;
  const token = process.env.GITHUB_TOKEN;
  const tag = process.env.GITHUB_REF_NAME;
  const ver = tag ? tag.replace(/^v/, '') : '';

  if (!repo || !releaseId || !token) {
    throw new Error(`Missing required environment variables: GITHUB_REPOSITORY=${repo}, RELEASE_ID=${releaseId}`);
  }

  console.log(`Fetching assets for release ID ${releaseId} in ${repo}...`);

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/${releaseId}/assets`, {
    headers: {
      'Authorization': `token ${token}`,
      'User-Agent': 'Node-Updater-Generator'
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch release assets: ${res.status} ${res.statusText}`);
  }

  const assets = await res.json();
  console.log(`Found ${assets.length} assets on draft release.`);

  const sigMap = {};

  for (const asset of assets) {
    console.log(`Checking asset: ${asset.name}`);
    if (asset.name.endsWith('.sig')) {
      const contentRes = await fetch(asset.url, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/octet-stream',
          'User-Agent': 'Node-Updater-Generator'
        }
      });
      if (contentRes.ok) {
        const sigText = (await contentRes.text()).trim();
        sigMap[asset.name] = sigText;
        console.log(`Successfully loaded signature for ${asset.name}`);
      }
    }
  }

  // Find signatures for each target platform
  const winKey = Object.keys(sigMap).find(k => k.includes('x64-setup') || k.includes('x64.nsis') || (k.includes('x64') && !k.includes('dmg') && !k.includes('darwin')));
  const macX64Key = Object.keys(sigMap).find(k => k.includes('x64.dmg') || (k.includes('x64') && k.includes('darwin')));
  const macArmKey = Object.keys(sigMap).find(k => k.includes('aarch64.dmg') || (k.includes('aarch64') && k.includes('darwin')));

  const winSig = winKey ? sigMap[winKey] : '';
  const macX64Sig = macX64Key ? sigMap[macX64Key] : '';
  const macArmSig = macArmKey ? sigMap[macArmKey] : '';

  const manifest = {
    version: ver,
    notes: `Release ${tag}`,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        signature: winSig,
        url: `https://github.com/${repo}/releases/download/${tag}/Todolist_${ver}_x64-setup.exe`
      },
      "darwin-x86_64": {
        signature: macX64Sig,
        url: `https://github.com/${repo}/releases/download/${tag}/Todolist_${ver}_x64.dmg`
      },
      "darwin-aarch64": {
        signature: macArmSig,
        url: `https://github.com/${repo}/releases/download/${tag}/Todolist_${ver}_aarch64.dmg`
      }
    }
  };

  fs.writeFileSync('latest.json', JSON.stringify(manifest, null, 2));
  console.log('Successfully generated latest.json:');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
