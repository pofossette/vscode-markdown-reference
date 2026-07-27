/**
 * Generate the extension icon (images/icon.png).
 *
 * Source SVG:
 * https://intellij-icons.jetbrains.design/icons/MarkdownIcons/icons/expui/markdown.svg
 *
 * Layout follows vscode-gradle-kotlin: a dark circular tile with the
 * JetBrains glyph centered at 58% of the 256px canvas.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'images');
const CACHE_DIR = path.resolve(__dirname, '.cache');
const SOURCE_FILE = path.join(CACHE_DIR, 'markdown.svg');
const OUT_FILE = path.join(OUT_DIR, 'icon.png');
const SVG_URL = 'https://intellij-icons.jetbrains.design/icons/MarkdownIcons/icons/expui/markdown.svg';
const SIZE = 256;
const GLYPH_RATIO = 0.58;

async function main() {
    let sharp;
    try {
        sharp = require('sharp');
    } catch {
        console.error("Missing dependency 'sharp'. Run 'bun install' first.");
        process.exit(1);
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    if (!fs.existsSync(SOURCE_FILE)) {
        console.log('Downloading JetBrains Markdown icon...');
        await download(SVG_URL, SOURCE_FILE);
    }

    const tileSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="#1B1B1F"/>
</svg>`;
    const tile = await sharp(Buffer.from(tileSvg)).png().toBuffer();
    const glyphSize = Math.round(SIZE * GLYPH_RATIO);
    const glyphTrimmed = await sharp(SOURCE_FILE, { density: 1024 })
        .trim()
        .png()
        .toBuffer();
    const glyph = await sharp(glyphTrimmed)
        .resize(glyphSize, glyphSize, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    const offset = Math.round((SIZE - glyphSize) / 2);

    await sharp(tile)
        .composite([{ input: glyph, left: offset, top: offset }])
        .png({ compressionLevel: 9 })
        .toFile(OUT_FILE);

    console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)} (${SIZE}x${SIZE})`);
}

function download(url, destination, redirects = 5) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'vscode-markdown-reference/icon-generator',
                Accept: 'image/svg+xml,*/*',
            },
        }, response => {
            if (
                response.statusCode
                && response.statusCode >= 300
                && response.statusCode < 400
                && response.headers.location
            ) {
                if (redirects <= 0) return reject(new Error(`Too many redirects for ${url}`));
                const next = new URL(response.headers.location, url).toString();
                response.resume();
                return resolve(download(next, destination, redirects - 1));
            }
            if (response.statusCode !== 200) {
                return reject(new Error(`GET ${url} failed: HTTP ${response.statusCode}`));
            }
            const file = fs.createWriteStream(destination);
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
            file.on('error', reject);
        }).on('error', reject);
    });
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
