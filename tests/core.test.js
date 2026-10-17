// 符号化・復号ロジックの検証。実行: npm i jsqr@1.4.0 && node tests/core.test.js
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const core = html.split('// CORE-BEGIN')[1].split('// CORE-END')[0];
const { b45enc, b45dec, LTEncoder, LTDecoder, buildData, buildMeta, parsePacket, typeFlags, gzip, gunzip, qrEncode } =
  new Function(core + ';return {b45enc,b45dec,LTEncoder,LTDecoder,buildData,buildMeta,parsePacket,typeFlags,gzip,gunzip,qrEncode}')();

for (let n = 0; n < 300; n++) { const b = crypto.randomBytes(n); assert.deepStrictEqual(Buffer.from(b45dec(b45enc(b))), b); }
console.log('base45: ok');

const m = parsePacket(b45dec(b45enc(buildMeta(7, 100, 1000, new Uint8Array(32).fill(9), 12345, '資料.pdf', 'application/pdf', typeFlags(true, 4)))));
assert.strictEqual(m.name, '資料.pdf'); assert.strictEqual(m.mime, 'application/pdf');
assert.strictEqual(m.origSize, 12345); assert.strictEqual(m.gz, true); assert.strictEqual(m.layout, 4);
for (const [gz, layout] of [[false, 1], [true, 1], [false, 2], [true, 4]]) {
  const d = parsePacket(buildData(1, 1000, 1000, 3, new Uint8Array(1000), typeFlags(gz, layout)));
  assert.strictEqual(d.type, 1); assert.strictEqual(d.gz, gz); assert.strictEqual(d.layout, layout);
}
const bad = buildData(1, 1000, 1000, 0, new Uint8Array(1000)); bad[100] ^= 1; assert.strictEqual(parsePacket(bad), null);
console.log('packet/crc/flags: ok');

let jsQR = null; try { jsQR = require('jsqr'); } catch (e) {}
if (jsQR) {
  for (const [bs, ecl] of [[400, 'L'], [700, 'L'], [1000, 'L'], [1000, 'M'], [1400, 'L'], [1800, 'L']]) {
    const data = crypto.randomBytes(bs), str = b45enc(buildData(123, 99999, bs, 5, data));
    const q = qrEncode(str, ecl), n = q.size, s = 3, t = (n + 8) * s, px = new Uint8ClampedArray(t * t * 4).fill(255);
    assert.notStrictEqual(q.version, 23);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.mod[r * n + c])
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const i = (((r + 4) * s + y) * t + (c + 4) * s + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
    const res = jsQR(px, t, t);
    assert.ok(res, `QR decode bs=${bs} ${ecl} v${q.version}`);
    assert.deepStrictEqual(Buffer.from(parsePacket(b45dec(res.data)).data), data);
  }
  console.log('QR encode→jsQR decode: ok');
} else console.log('QR encode→decode: skipped (npm i jsqr@1.4.0 で実行)');

(async () => {
const text = Buffer.from('日付,案件,ステータス,担当\n'.repeat(20000));
const z = await gzip(text);
assert.deepStrictEqual(Buffer.from(await gunzip(z)), text);
const rnd = crypto.randomBytes(200000);
assert.deepStrictEqual(Buffer.from(await gunzip(await gzip(rnd))), rnd);
console.log(`gzip: ok (テキスト ${text.length}→${z.length} byte)`);

for (const [size, bs, loss, late] of [[1e6, 1000, 0, 0], [1e6, 1000, 0.2, 0], [3e6, 1000, 0.3, 1], [2e6, 1400, 0.1, 1], [999, 700, 0.5, 0]]) {
  const f = crypto.randomBytes(size), e = new LTEncoder(f, bs), d = new LTDecoder(size, bs);
  let recv = 0;
  for (let seed = late ? Math.floor(Math.random() * e.K) : 0; !d.complete; seed++) {
    if (Math.random() < loss) continue;
    const p = parsePacket(buildData(1, size, bs, seed, e.block(seed))); d.add(p.seed, p.data); recv++;
  }
  assert.deepStrictEqual(Buffer.from(d.assemble()), f);
  console.log(`fountain size=${size} loss=${loss} late=${late}: ok (受信 ${(recv / e.K).toFixed(3)}×K)`);
}
})().catch(e => { console.error(e); process.exit(1); });

// lab.html に埋め込んだ共通部分が index.html と一致しているか
{
  const lab = fs.readFileSync(path.join(__dirname, '..', 'lab.html'), 'utf8');
  const labCore = lab.split('// CORE-BEGIN')[1].split('// CORE-END')[0];
  assert.strictEqual(labCore, core, 'lab.html の CORE が index.html と一致しません');
  console.log('lab.html core sync: ok');
}
