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

  // ---------------------------------------------------------------- ZIP

  function isZip(u8) {
    return u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;
  }

  async function inflateRaw(u8) {
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** ZIP内のファイルを [{name, data:Uint8Array}] で返す（セントラルディレクトリを読む最小実装） */
  async function unzip(buffer) {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIPファイルとして読み込めませんでした。');

    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const utf8 = new TextDecoder('utf-8');
    const files = [];
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIPのディレクトリ情報が壊れています。');
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = utf8.decode(u8.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/')) continue;

      const start = localOff + 30 + dv.getUint16(localOff + 26, true) + dv.getUint16(localOff + 28, true);
      const raw = u8.subarray(start, start + compSize);
      let data;
      if (method === 0) data = raw;
      else if (method === 8) data = await inflateRaw(raw);
      else throw new Error(`未対応の圧縮形式です（method=${method}）。`);
      files.push({ name, data });
    }
    return files;
  }

  /** ZIP / XML のバイト列から、キャラクターXMLのテキストを [{name, xml}] で取り出す */
  async function extractXmlTexts(buffer, fileName = '') {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const utf8 = new TextDecoder('utf-8');
    if (!isZip(u8)) return [{ name: fileName, xml: utf8.decode(u8) }];
    const xmls = (await unzip(u8))
      .filter(f => /\.xml$/i.test(f.name))
      .map(f => ({ name: f.name, xml: utf8.decode(f.data) }))
      .filter(f => /<character[\s>]/.test(f.xml));
    if (!xmls.length) throw new Error('ZIP内にユドナリウムのキャラクターXMLが見つかりませんでした。');
    return xmls;
  }

  // ---------------------------------------------------------------- XML

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
      for (const c of dataChildren(el)) {
        const label = c.getAttribute('name') || '';
        const type = c.getAttribute('type') || '';
        if (dataChildren(c).length) { walk(c, section); continue; }
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

  function items(parsed, kind) {
    return parsed.sections.flatMap(s => s.items.filter(i => i.kind === kind));
  }

  function findValue(parsed, label) {
    for (const s of parsed.sections) {
      const hit = s.items.find(i => i.label === label && (i.kind === 'param' || i.kind === 'resource'));
      if (hit) return hit.value;
    }
    return '';
  }

  function buildMemo(parsed, opts) {
    const v = l => findValue(parsed, l);
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
    return text.replace(/\{([^{}\n]+)\}/g, (m, key) => (key in values ? values[key] : m));
  }

  function buildCommands(parsed, status, params, opts) {
    let text = parsed.palette.replace(/\n+$/, '');
    if (opts.expandRefs) {
      const values = {};
      for (const p of params) values[p.label] = p.value;
      for (const s of status) values[s.label] = s.value;
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

    return {
      kind: 'character',
      data: {
        name: parsed.name,
        memo: buildMemo(parsed, opts),
        initiative: parseInitiative(findValue(parsed, 'イニシアチブ')),
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
    for (const m of d.commands.matchAll(/\{([^{}\n]+)\}/g)) if (!known.has(m[1])) missing.add(m[1]);
    return [...missing];
  }

  return {
    DEFAULT_OPTIONS,
    unzip,
    extractXmlTexts,
    parseUdonariumXml,
    toCcfolia,
    unresolvedReferences,
  };
});
