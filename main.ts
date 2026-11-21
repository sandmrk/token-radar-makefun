import { parseSnapshot, buildRadar, boardIssue, dataScript } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

async function main() {
    const args = process.argv.slice(2);
    let inputPath = '/input';
    let outputPath = process.env.MAKEFUN_OUTPUT_DIR || '/output';

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--input') {
            inputPath = args[++i];
        } else if (arg.startsWith('--input=')) {
            inputPath = arg.split('=')[1];
        } else if (arg === '--output') {
            outputPath = args[++i];
        } else if (arg.startsWith('--output=')) {
            outputPath = arg.split('=')[1];
        }
    }

    let snapshotPath = inputPath;
    try {
        const stat = await fs.stat(snapshotPath);
        if (stat.isDirectory()) {
            snapshotPath = path.join(snapshotPath, 'snapshot.json');
        }
    } catch (e) {
        // Path might not exist, handled by access check below
    }

    try {
        await fs.access(snapshotPath);
    } catch (e) {
        process.stderr.write(`token radar: no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
        process.exit(2);
    }

    const snapshotData = await fs.readFile(snapshotPath, 'utf8');
    const snapshot = parseSnapshot(snapshotData);
    const { board, radar } = buildRadar(snapshot);
    const issue = boardIssue(board, snapshot);
    if (issue) {
        process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
        process.exit(1);
    }

    await fs.mkdir(outputPath, { recursive: true });
    await fs.writeFile(path.join(outputPath, 'board.json'), JSON.stringify({ rows: board }) + '\n');
    await fs.writeFile(path.join(outputPath, 'data.js'), dataScript(radar));

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const repoDashboardDir = path.join(__dirname, 'dashboard');
    const repoScreenshotsDir = path.join(__dirname, 'screenshots');
    const outDashboardDir = path.join(outputPath, 'dashboard');
    const outScreenshotsDir = path.join(outputPath, 'screenshots');

    await fs.mkdir(outDashboardDir, { recursive: true });
    await fs.mkdir(outScreenshotsDir, { recursive: true });

    const dashboardFiles = await fs.readdir(repoDashboardDir);
    let dashboardCopyCount = 0;
    for (const file of dashboardFiles) {
        if (file.startsWith('.')) continue;
        const src = path.join(repoDashboardDir, file);
        const stat = await fs.stat(src);
        if (stat.isFile()) {
            await fs.copyFile(src, path.join(outDashboardDir, file));
            dashboardCopyCount++;
        }
    }

    const screenshotFiles = await fs.readdir(repoScreenshotsDir);
    const screenshotRegex = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
    let screenshotCopyCount = 0;
    for (const file of screenshotFiles) {
        if (file.startsWith('.')) continue;
        if (!screenshotRegex.test(file)) {
            process.stderr.write(`token radar: screenshots/${file}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
            process.exit(1);
        }
        const src = path.join(repoScreenshotsDir, file);
        const stat = await fs.stat(src);
        if (stat.isFile()) {
            await fs.copyFile(src, path.join(outScreenshotsDir, file));
            screenshotCopyCount++;
        }
    }

    if (screenshotCopyCount < 3) {
        const word = screenshotCopyCount === 1 ? 'image' : 'images';
        process.stderr.write(`token radar: screenshots/ holds ${screenshotCopyCount} ${word}: hand in 3, the board, a detail view and a filtered view\n`);
        process.exit(1);
    }

    await fs.writeFile(path.join(outputPath, 'dossier.json'), buildDossier(outputPath, {
        text_max_bytes: 65536,
        screenshots: { max: 4, max_bytes: 524288 },
        dashboard: { max_files: 400, max_bytes: 4194304 }
    }));

    console.log(`token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)`);
    console.log(`token radar: wrote ${outputPath}/board.json, ${outputPath}/data.js, ${outputPath}/dashboard (${dashboardCopyCount} files), ${outputPath}/screenshots (${screenshotCopyCount} images) and ${outputPath}/dossier.json`);
}

main();
