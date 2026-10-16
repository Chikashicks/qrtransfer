// 符号化・復号ロジックの検証。実行: npm i qrcode-generator@1.4.4 jsqr@1.4.0 && node tests/core.test.js
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const core = html.split('// CORE-BEGIN')[1].split('// CORE-END')[0];
const { b45enc, b45dec, LTEncoder, LTDecoder, buildData, buildMeta, parsePacket } =
  new Function(core + ';return {b45enc,b45dec,LTEncoder,LTDecoder,buildData,buildMeta,parsePacket}')();

for (let n = 0; n < 300; n++) { const b = crypto.randomBytes(n); assert.deepStrictEqual(Buffer.from(b45dec(b45enc(b))), b); }
console.log('base45: ok');

const m = parsePacket(b45dec(b45enc(buildMeta(7, 100, 1000, new Uint8Array(32).fill(9), '資料.pdf', 'application/pdf'))));
assert.strictEqual(m.name, '資料.pdf'); assert.strictEqual(m.mime, 'application/pdf');
const bad = buildData(1, 1000, 1000, 0, new Uint8Array(1000)); bad[100] ^= 1; assert.strictEqual(parsePacket(bad), null);
console.log('packet/crc: ok');

let qr = null; try { qr = { qrcode: require('qrcode-generator'), jsQR: require('jsqr') }; } catch (e) {}
if (qr) {
  for (const bs of [400, 700, 1000, 1400]) {
    const data = crypto.randomBytes(bs), str = b45enc(buildData(123, 99999, bs, 5, data));
    let q = qr.qrcode(0, 'L'); q.addData(str, 'Alphanumeric'); q.make();
    if (q.getModuleCount() === 109) { q = qr.qrcode(24, 'L'); q.addData(str, 'Alphanumeric'); q.make(); }
    const n = q.getModuleCount(), s = 3, t = (n + 8) * s, px = new Uint8ClampedArray(t * t * 4).fill(255);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c))
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const i = (((r + 4) * s + y) * t + (c + 4) * s + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
    const res = qr.jsQR(px, t, t);
    assert.ok(res, `QR decode bs=${bs}`);
    assert.deepStrictEqual(Buffer.from(parsePacket(b45dec(res.data)).data), data);
  }
  console.log('QR round trip: ok');
} else console.log('QR round trip: skipped (qrcode-generator / jsqr not installed)');

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
