'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

async function writePrintPack(root, { slug, analysis, label }) {
  const safe = String(slug || 'export').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const ts = Date.now();
  const folderName = `pack_${safe}_${ts}`;
  const dir = path.join(root, 'generated', folderName);
  await fs.mkdir(dir, { recursive: true });

  const base = path.join(root, 'generated', `cuban_${safe}`);
  const exts = ['stl', 'obj', 'cad'];
  const copied = [];
  for (const ext of exts) {
    const src = `${base}.${ext}`;
    if (fsSync.existsSync(src)) {
      const dest = path.join(dir, `cuban_${safe}.${ext}`);
      await fs.copyFile(src, dest);
      copied.push(`cuban_${safe}.${ext}`);
    }
  }

  const readme = `Matrix Workshop — 3D print pack
Generated: ${new Date().toISOString()}
Label: ${label || safe}

UNITS: STL/OBJ are in millimetres (scene units). Verify in your slicer (scale 100%, mm).

Files:
${copied.map((c) => `  - ${c}`).join('\n')}

Before printing:
- Confirm XY scale matches calipers on a reference link if available.
- Minimum feature size depends on process (resin vs FDM vs wax).
- This mesh is a CAD proxy (link + clasp); not a photogrammetry scan.

Analysis JSON is included as analysis.json (if provided).

— AI3DDesign / Matrix Workshop
`;

  await fs.writeFile(path.join(dir, 'README_PRINT.txt'), readme, 'utf8');
  let analysisPath = null;
  if (analysis) {
    analysisPath = 'analysis.json';
    await fs.writeFile(path.join(dir, 'analysis.json'), JSON.stringify(analysis, null, 2), 'utf8');
  }

  const zipName = `${folderName}.zip`;
  const zipPath = path.join(root, 'generated', zipName);
  let zipped = false;
  try {
    execFileSync('zip', ['-q', '-r', zipPath, '.'], { cwd: dir });
    zipped = fsSync.existsSync(zipPath);
  } catch (_) {
    zipped = false;
  }

  return {
    folder: `generated/${folderName}`,
    folderUrl: `/generated/${folderName}/`,
    readmeUrl: `/generated/${folderName}/README_PRINT.txt`,
    zipUrl: zipped ? `/generated/${zipName}` : null,
    copied,
    analysisUrl: analysisPath ? `/generated/${folderName}/${analysisPath}` : null,
  };
}

module.exports = { writePrintPack };
