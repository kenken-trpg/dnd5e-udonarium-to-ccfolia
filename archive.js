/* JSONの一括保存用ZIP。無圧縮・UTF-8の標準ZIPを依存ライブラリなしで作る。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UdonArchive = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const encoder = new TextEncoder();
  const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
    for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
    return n >>> 0;
  });
  function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    return (crc ^ 0xffffffff) >>> 0;
  }
  function safeName(value) {
    // パス区切りだけでなく、ファイル名に使えない制御文字も除く。
    // eslint-disable-next-line no-control-regex
    const name = [...String(value).normalize('NFC').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '_')]
      .slice(0, 80).join('').replace(/^[. ]+|[. ]+$/g, '') || 'character';
    let short = name;
    while (encoder.encode(short).length > 180) short = [...short].slice(0, -1).join('');
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(short) ? `_${short}` : short;
  }
  /** 同名・大文字小文字だけの違い・正規化後の衝突も連番で避ける。 */
  function jsonFiles(characters) {
    const used = new Set();
    return characters.map(character => {
      const base = safeName(character.data.name);
      let name = `${base}_ccfolia.json`;
      let seq = 1;
      while (used.has(name.toLowerCase())) name = `${base}_${++seq}_ccfolia.json`;
      used.add(name.toLowerCase());
      return { name, data: encoder.encode(JSON.stringify(character, null, 2)) };
    });
  }
  function createJsonZip(characters) {
    if (!characters.length || characters.length > 50) throw new Error('ZIPに保存できるのは1〜50体です。');
    const chunks = [];
    const directory = [];
    let offset = 0;
    for (const { name, data } of jsonFiles(characters)) {
      const encodedName = encoder.encode(name);
      const local = new Uint8Array(30 + encodedName.length);
      const l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true);
      l.setUint16(4, 20, true);
      l.setUint16(6, 0x800, true); // UTF-8
      l.setUint16(12, 33, true); // 1980-01-01（再現可能な固定日時）
      const crc = crc32(data);
      l.setUint32(14, crc, true);
      l.setUint32(18, data.length, true);
      l.setUint32(22, data.length, true);
      l.setUint16(26, encodedName.length, true);
      local.set(encodedName, 30);
      const central = new Uint8Array(46 + encodedName.length);
      const c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      central.set(local.subarray(4, 30), 6);
      c.setUint32(42, offset, true);
      central.set(encodedName, 46);
      directory.push(central);
      chunks.push(local, data);
      offset += local.length + data.length;
      if (offset > 64 * 1024 * 1024) throw new Error('保存するJSONの合計が大きすぎます（上限64MB）。');
    }
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, characters.length, true);
    e.setUint16(10, characters.length, true);
    e.setUint32(12, directory.reduce((sum, data) => sum + data.length, 0), true);
    e.setUint32(16, offset, true);
    return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
  }
  return { safeName, jsonFiles, createJsonZip, crc32 };
});
