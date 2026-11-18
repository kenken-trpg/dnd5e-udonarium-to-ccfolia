/*
 * D&D5e ユドナリウムコマ → ココフォリア用JSON 変換ロジック
 *
 * 想定入力: https://unib-5e-udonarium-pc.onrender.com/ で利用者が生成・保存した
 *           ユドナリウムのキャラクターXML（または、それを含むZIP）
 * ブラウザでは window.UdonCcfolia、Node では module.exports として使える。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UdonCcfolia = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- 上限

  /**
   * 悪意のある・壊れたファイルでブラウザが固まらないための上限。
   * 生成ツールのZIPは数KB、キャラクターXMLは10KB前後なので十分に余裕がある。
   */
  const LIMITS = Object.freeze({
    maxInputBytes: 20 * 1024 * 1024, // 読み込むファイル1つの大きさ
    maxBatchFiles: 50,              // 1回に選べるファイル数
    maxTotalXmlBytes: 20 * 1024 * 1024, // ZIP全体で展開するXMLの合計
    maxZipEntries: 1000,             // ZIP内のファイル数
    maxXmlBytes: 5 * 1024 * 1024,    // 展開後のXML1つの大きさ（ZIP爆弾対策）
  });
  const MB = n => `${Math.round(n / 1024 / 1024)}MB`;

  // ---------------------------------------------------------------- ZIP

  const SIG_LOCAL = 0x04034b50;
  const SIG_CENTRAL = 0x02014b50;
  const SIG_EOCD = 0x06054b50;
  const BROKEN_ZIP = 'ZIPのディレクトリ情報が壊れています。';

  function isZip(u8) {
    return u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;
  }

  function checkInputSize(u8) {
    if (u8.length > LIMITS.maxInputBytes) {
      throw new Error(`ファイルが大きすぎます（上限 ${MB(LIMITS.maxInputBytes)}）。`);
    }
  }

  /** deflate-raw を展開する。limit バイトを超えた時点で打ち切る */
  async function inflateRaw(u8, limit) {
    const reader = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > limit) break;
        chunks.push(value);
      }
    } catch {
      throw new Error('ZIPの展開に失敗しました。ファイルが壊れている可能性があります。');
    }
    if (total > limit) {
      reader.cancel().catch(() => {});
      throw new Error(`ZIP内のファイルが大きすぎます（上限 ${MB(limit)}）。`);
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  /**
   * ZIP内のファイルを [{name, data:Uint8Array}] で返す（セントラルディレクトリを読む最小実装）。
   * filter を渡すと、名前が一致したファイルだけを展開する。
   */
  async function unzip(buffer, { filter = () => true } = {}) {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    checkInputSize(u8);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const inBounds = (off, len) => off >= 0 && len >= 0 && off + len <= u8.length;

    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIPファイルとして読み込めませんでした。');

    const count = dv.getUint16(eocd + 10, true);
    if (count > LIMITS.maxZipEntries) throw new Error(`ZIP内のファイルが多すぎます（上限 ${LIMITS.maxZipEntries}個）。`);
    let p = dv.getUint32(eocd + 16, true);
    const utf8 = new TextDecoder('utf-8');
    const files = [];
    let totalBytes = 0;
    for (let k = 0; k < count; k++) {
      if (!inBounds(p, 46) || dv.getUint32(p, true) !== SIG_CENTRAL) throw new Error(BROKEN_ZIP);
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      if (!inBounds(p + 46, nameLen + extraLen + commentLen)) throw new Error(BROKEN_ZIP);
      const name = utf8.decode(u8.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/') || !filter(name)) continue;

      if (!inBounds(localOff, 30) || dv.getUint32(localOff, true) !== SIG_LOCAL) throw new Error(BROKEN_ZIP);
      const start = localOff + 30 + dv.getUint16(localOff + 26, true) + dv.getUint16(localOff + 28, true);
      if (!inBounds(start, compSize)) throw new Error(BROKEN_ZIP);
      const raw = u8.subarray(start, start + compSize);
      const remaining = LIMITS.maxTotalXmlBytes - totalBytes;
      if (remaining <= 0) throw new Error('ZIP内のXMLの合計が大きすぎます（上限20MB）。');
      const limit = Math.min(LIMITS.maxXmlBytes, remaining);
      let data;
      if (method === 0) {
        if (raw.length > limit) throw new Error(`ZIP内のファイルが大きすぎます（上限 ${MB(limit)}）。`);
        data = raw;
      } else if (method === 8) {
        data = await inflateRaw(raw, limit);
      } else {
        throw new Error(`未対応の圧縮形式です（method=${method}）。`);
      }
      totalBytes += data.length;
      files.push({ name, data });
    }
    return files;
  }

  const isXmlName = name => /\.xml$/i.test(name);

  /** ZIP / XML のバイト列から、キャラクターXMLのテキストを [{name, xml}] で取り出す */
  async function extractXmlTexts(buffer, fileName = '') {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    checkInputSize(u8);
    const utf8 = new TextDecoder('utf-8');
    if (!isZip(u8)) {
      if (u8.length > LIMITS.maxXmlBytes) throw new Error(`XMLが大きすぎます（上限 ${MB(LIMITS.maxXmlBytes)}）。`);
      return [{ name: fileName, xml: utf8.decode(u8) }];
    }
    // 画像などは展開しない
    const xmls = (await unzip(u8, { filter: isXmlName }))
      .map(f => ({ name: f.name, xml: utf8.decode(f.data) }))
      .filter(f => CHARACTER_TAG.test(f.xml));
    if (!xmls.length) throw new Error('ZIP内にユドナリウムのキャラクターXMLが見つかりませんでした。');
    return xmls;
  }

  // ---------------------------------------------------------------- XML

  const CHARACTER_TAG = /<character[\s>]/;
  // ユドナリウムはDTDを出力しない。実体展開による膨張（billion laughs）や外部参照を避けるため拒否する
  const DTD = /<!DOCTYPE|<!ENTITY/i;

  function dataChildren(el) {
    const out = [];
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && n.nodeName === 'data') out.push(n);
    }
    return out;
  }

  function findChild(el, name) {
    return el ? dataChildren(el).find(c => c.getAttribute('name') === name) || null : null;
  }

  /** 中身が全角スペース等の空白だけなら空文字にする */
  function cleanText(s) {
    const t = String(s == null ? '' : s).replace(/\r\n?/g, '\n');
    return /^[\s　]*$/.test(t) ? '' : t.replace(/^\n+|[\s　]+$/g, '');
  }

  /**
   * ユドナリウムのキャラクターXMLを中間形式に変換する。
   * @returns {{name, size, sections:[{name, items:[...]}], palette, dicebot}}
   *   item: {kind:'resource', label, value, max} | {kind:'param', label, value}
   *       | {kind:'note', label, value} | {kind:'entry', label}  // 呪文名など値の無い項目
   */
  function parseUdonariumXml(xmlText, DOMParserImpl) {
    const Parser = DOMParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!Parser) throw new Error('DOMParser が利用できません。');
    if (DTD.test(xmlText)) throw new Error('DTD（<!DOCTYPE>）を含むXMLには対応していません。');
    const doc = new Parser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XMLの解析に失敗しました。');

    const charEl = doc.getElementsByTagName('character')[0];
    if (!charEl) throw new Error('ユドナリウムのキャラクターデータ（<character>）ではありません。');
    const top = findChild(charEl, 'character');
    if (!top) throw new Error('キャラクターデータ（data name="character"）が見つかりません。');

    const common = findChild(top, 'common');
    const name = cleanText(findChild(common, 'name')?.textContent) || '名称未設定';
    const size = Number(findChild(common, 'size')?.textContent) || 1;

    const sections = [];
    const walk = (el, section) => {
      const stack = dataChildren(el).reverse();
      while (stack.length) {
        const c = stack.pop();
        const label = c.getAttribute('name') || '';
        const type = c.getAttribute('type') || '';
        const children = dataChildren(c);
        if (children.length) { stack.push(...children.reverse()); continue; }
        const text = c.textContent || '';
        if (type === 'numberResource') {
          const max = cleanText(text);
          const cur = cleanText(c.getAttribute('currentValue'));
          if (max === '' && cur === '') continue; // 使わない呪文スロット等
          section.items.push({ kind: 'resource', label, value: cur === '' ? max : cur, max });
        } else if (type === 'note') {
          section.items.push({ kind: 'note', label, value: cleanText(text) });
        } else if (type === 'image') {
          // 画像はココフォリアに持ち込めないので無視
        } else if (cleanText(text) === '' && !c.hasAttribute('type') && c.childNodes.length === 0 && section.name === '呪文') {
          section.items.push({ kind: 'entry', label });
        } else {
          section.items.push({ kind: 'param', label, value: cleanText(text) });
        }
      }
    };
    const detail = findChild(top, 'detail');
    if (detail) {
      for (const sec of dataChildren(detail)) {
        const section = { name: sec.getAttribute('name') || '', items: [] };
        walk(sec, section);
        sections.push(section);
      }
    }

    const paletteEl = charEl.getElementsByTagName('chat-palette')[0];
    return {
      name,
      size,
      sections,
      palette: paletteEl ? (paletteEl.textContent || '').replace(/\r\n?/g, '\n') : '',
      dicebot: paletteEl ? paletteEl.getAttribute('dicebot') || '' : '',
    };
  }

  // ---------------------------------------------------------------- ココフォリア

  const DEFAULT_OPTIONS = {
    includeNotes: false,   // 特徴等（背景・人格的特徴…）をメモに含める
    expandRefs: false,     // チャットパレットの {ラベル} を値に置き換える
    externalUrl: '',
    color: '#888888',
  };

  // パレット中の {ラベル} 参照
  const REF = /\{([^{}\n]+)\}/g;

  function items(parsed, kind) {
    return parsed.sections.flatMap(s => s.items.filter(i => i.kind === kind));
  }

  /** ラベル → 値（同じラベルが複数あれば最初のもの）。メモ・イニシアチブ用 */
  function valueLookup(parsed) {
    const map = new Map();
    for (const s of parsed.sections) {
      for (const i of s.items) {
        if ((i.kind === 'param' || i.kind === 'resource') && !map.has(i.label)) map.set(i.label, i.value);
      }
    }
    return label => map.get(label) || '';
  }

  function buildMemo(parsed, v, opts) {
    const join = (...xs) => xs.filter(Boolean).join(' / ');
    const lines = [];
    if (v('プレイヤー')) lines.push(`PL: ${v('プレイヤー')}`);
    lines.push(join(v('レベル') && `レベル${v('レベル')}`, v('クラス'), v('種族'), v('属性')));
    lines.push(join(v('AC') && `AC ${v('AC')}`, v('移動速度') && `移動 ${v('移動速度')}`, v('サイズ')));
    lines.push(join(v('ヒット・ダイス') && `HD ${v('ヒット・ダイス')}`,
      v('呪文セーブ') && `呪文セーヴDC ${v('呪文セーブ')}`,
      v('呪文攻撃ロール') && v('呪文セーブ') && `呪文攻撃 ${v('呪文攻撃ロール')}`));
    if (opts.externalUrl) lines.push(opts.externalUrl);

    if (opts.includeNotes) {
      for (const n of items(parsed, 'note')) {
        if (n.value) lines.push('', `【${n.label}】`, n.value);
      }
    }
    return lines.filter((l, i) => l !== '' || i > 0).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function expandReferences(text, values) {
    return text.replace(REF, (m, key) => (values.has(key) ? values.get(key) : m));
  }

  function buildCommands(parsed, status, params, opts) {
    let text = parsed.palette.replace(/\n+$/, '');
    if (opts.expandRefs) {
      // 同名ならステータス（現在値）を優先
      const values = new Map([...params, ...status].map(x => [x.label, x.value]));
      text = expandReferences(text, values);
    }
    return text;
  }

  function parseInitiative(v) {
    const n = parseInt(String(v).replace(/[^\d+-]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }

  /** 中間形式 → ココフォリアのクリップボード貼り付け用オブジェクト */
  function toCcfolia(parsed, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const status = items(parsed, 'resource').map(r => ({ label: r.label, value: r.value, max: r.max }));
    const params = items(parsed, 'param').map(p => ({ label: p.label, value: p.value }));
    const v = valueLookup(parsed);

    return {
      kind: 'character',
      data: {
        name: parsed.name,
        memo: buildMemo(parsed, v, opts),
        initiative: parseInitiative(v('イニシアチブ')),
        externalUrl: opts.externalUrl || '',
        status,
        params,
        iconUrl: null,
        faces: [],
        x: 0,
        y: 0,
        angle: 0,
        width: 4,
        height: 4,
        active: true,
        secret: false,
        invisible: false,
        hideStatus: false,
        color: opts.color || DEFAULT_OPTIONS.color,
        commands: buildCommands(parsed, status, params, opts),
        owner: null,
      },
    };
  }

  /** パレット中の {参照} のうち、ステータス・パラメータに存在しないもの */
  function unresolvedReferences(ccfolia) {
    const d = ccfolia.data;
    const known = new Set([...d.status, ...d.params].map(x => x.label));
    const missing = new Set();
    for (const m of d.commands.matchAll(REF)) if (!known.has(m[1])) missing.add(m[1]);
    return [...missing];
  }

  return {
    DEFAULT_OPTIONS,
    LIMITS,
    unzip,
    extractXmlTexts,
    parseUdonariumXml,
    toCcfolia,
    unresolvedReferences,
  };
});
