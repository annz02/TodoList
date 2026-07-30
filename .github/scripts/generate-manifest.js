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
  console.log(`Found ${assets.length} assets on release.`);

  const sigMap = {};

  for (const asset of assets) {
    console.log(`Checking asset: ${asset.name}`);
    if (asset.name.endsWith('.sig')) {
      // Use browser_download_url directly to avoid passing GitHub API Authorization headers to AWS S3
      const downloadUrl = asset.browser_download_url || `https://github.com/${repo}/releases/download/${tag}/${asset.name}`;
      console.log(`Fetching signature from: ${downloadUrl}`);
      
      const contentRes = await fetch(downloadUrl, {
        headers: {
          'User-Agent': 'Node-Updater-Generator'
        }
      });

      if (contentRes.ok) {
        const sigText = (await contentRes.text()).trim();
        if (!sigText.includes('untrusted comment')) {
          console.error(`ERROR: Signature file ${asset.name} did not contain valid minisign header! Content sample:\n${sigText.substring(0, 150)}`);
          continue;
        }
        sigMap[asset.name] = sigText;
        console.log(`Successfully loaded valid minisign signature for ${asset.name} (${sigText.length} bytes)`);
      } else {
        console.warn(`Failed to fetch signature content for ${asset.name}: HTTP ${contentRes.status}`);
      }
    }
  }

  // Helper function to find matching updater payload asset and its signature
  const findPlatformArtifact = (matcher) => {
    const payloadAsset = assets.find(a => matcher(a.name) && !a.name.endsWith('.sig'));
    if (!payloadAsset) return null;
    
    // Find matching signature asset: either payloadName + '.sig' or matching matcher + '.sig'
    const sigAsset = assets.find(a => a.name === `${payloadAsset.name}.sig`);
    const sigText = sigAsset ? sigMap[sigAsset.name] : null;

    if (!sigText) {
      console.warn(`Warning: Payload asset ${payloadAsset.name} was found, but signature ${payloadAsset.name}.sig is missing or invalid.`);
      return null;
    }

    return {
      signature: sigText,
      url: payloadAsset.browser_download_url || `https://github.com/${repo}/releases/download/${tag}/${payloadAsset.name}`
    };
  };

  // 1. Windows x64: match .nsis.zip or .msi.zip updater payload archive
  const winTarget = findPlatformArtifact(name => name.includes('x64') && (name.endsWith('.nsis.zip') || name.endsWith('.zip')) && !name.includes('darwin'));

  // 2. macOS x86_64: match x64.app.tar.gz or tar.gz
  const macX64Target = findPlatformArtifact(name => (name.includes('x64') || name.includes('x86_64')) && name.includes('darwin') && name.endsWith('.tar.gz') || name.endsWith('x64.app.tar.gz'));

  // 3. macOS aarch64: match aarch64.app.tar.gz
  const macArmTarget = findPlatformArtifact(name => (name.includes('aarch64') || name.includes('arm64')) && (name.includes('darwin') || name.endsWith('aarch64.app.tar.gz')) && name.endsWith('.tar.gz'));

  if (!winTarget || !winTarget.signature) {
    throw new Error(`CRITICAL: Windows update payload (.nsis.zip) or signature is missing! Check if TAURI_SIGNING_PRIVATE_KEY secret is configured in GitHub Secrets.`);
  }

  const manifest = {
    version: ver,
    notes: `Release ${tag}`,
    pub_date: new Date().toISOString(),
    platforms: {}
  };

  if (winTarget) manifest.platforms["windows-x86_64"] = winTarget;
  if (macX64Target) manifest.platforms["darwin-x86_64"] = macX64Target;
  if (macArmTarget) manifest.platforms["darwin-aarch64"] = macArmTarget;

  fs.writeFileSync('latest.json', JSON.stringify(manifest, null, 2));
  console.log('Successfully generated latest.json:');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch(err => {
  console.error('Failed to generate latest.json:', err);
  process.exit(1);
});
