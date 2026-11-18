/*
 * ブラウザ版のUI。変換そのものは converter.js（window.UdonCcfolia）が行う。
 * CSP でインラインスクリプトを禁止しているので、UIのコードはこのファイルに置く。
 */
(() => {
  'use strict';
  const C = window.UdonCcfolia;
  const $ = id => document.getElementById(id);
  const msg = $('msg');
  const results = $('results');
  /** @type {{parsed, out, el}[]} */
  let entries = [];
  // 読み込み中に次のファイルが来たら、古い読み込みの結果は捨てる
  let loadGeneration = 0;

  const setMsg = (text, kind = '') => { msg.textContent = text; msg.className = 'msg' + (kind ? ' ' + kind : ''); };

  // ---- ツールチップ
  let tipSeq = 0;
  /** root 内の .has-tip に id と aria-describedby を付ける（テンプレートを複製したあとにも呼ぶ） */
  function wireTips(root) {
    for (const wrap of root.querySelectorAll('.has-tip')) {
      const tip = wrap.querySelector(':scope > .tip');
      if (!tip || tip.id) continue;
      tip.id = `tip-${++tipSeq}`;
      for (const el of wrap.querySelectorAll('button, input, [tabindex]')) el.setAttribute('aria-describedby', tip.id);
      // 画面の右端からはみ出さないよう、表示のたびに位置を調整する
      const place = () => {
        wrap.classList.remove('tip-off');
        tip.style.left = '';
        const over = tip.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
        if (over > 0) tip.style.left = `${-over}px`;
      };
      wrap.addEventListener('mouseenter', place);
      wrap.addEventListener('focusin', place);
      wrap.querySelector(':scope > .tip-btn')?.addEventListener('click', () => {
        wrap.querySelector(':scope > .tip-btn').focus();
        place();
      });
    }
  }
  // Esc で開いているツールチップを閉じる（次にマウスを乗せる・フォーカスするまで）
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    for (const wrap of document.querySelectorAll('.has-tip:hover, .has-tip:focus-within')) wrap.classList.add('tip-off');
  });

  for (const el of document.querySelectorAll('[data-limit]')) {
    el.textContent = `${Math.round(C.LIMITS[el.dataset.limit] / 1024 / 1024)}MB`;
  }
  wireTips(document);

  // 手元のファイルとして開いているときは、ZIPのダウンロード案内を出さない（ZIPは公開ページにしか無い）
  if (location.protocol === 'file:') for (const el of document.querySelectorAll('[data-online-only]')) el.hidden = true;

  // ---- 出力オプション
  const outputOptions = () => ({
    includeNotes: $('opt-notes').checked,
    expandRefs: $('opt-expand').checked,
    color: $('opt-color').value,
  });

  // 選んだオプションはこのブラウザの localStorage に覚えておく。
  // プライベートウィンドウなどで使えない・壊れた値が入っている場合は、既定のまま動く
  const OPTIONS_KEY = 'dnd5e-ccfolia:options';
  function restoreOptions() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(OPTIONS_KEY)); } catch { return; }
    if (!saved || typeof saved !== 'object') return;
    if (typeof saved.includeNotes === 'boolean') $('opt-notes').checked = saved.includeNotes;
    if (typeof saved.expandRefs === 'boolean') $('opt-expand').checked = saved.expandRefs;
    if (typeof saved.color === 'string' && /^#[0-9a-f]{6}$/i.test(saved.color)) $('opt-color').value = saved.color;
  }
  function saveOptions() {
    try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(outputOptions())); } catch { /* 保存できなくても変換には影響しない */ }
  }
  restoreOptions();
  // 色を選んでいる間は input が連続して来るので、1フレームに1回だけ描き直す
  let renderQueued = false;
  function renderAll() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      const options = outputOptions();
      entries.forEach(entry => render(entry, options));
    });
  }
  for (const id of ['opt-notes', 'opt-expand', 'opt-color']) {
    $(id).addEventListener('input', () => { saveOptions(); renderAll(); });
  }

  // ---- 変換結果の表示
  const chip = text => Object.assign(document.createElement('span'), { className: 'chip', textContent: text });

  function render(entry, options = outputOptions()) {
    const out = C.toCcfolia(entry.parsed, options);
    entry.out = out;
    const f = name => entry.fields.get(name);
    const d = out.data;
    const values = new Map(d.params.map(p => [p.label, p.value]));
    const val = l => values.get(l) || '';

    f('name').textContent = d.name;
    f('sub').textContent = [val('プレイヤー') && 'PL: ' + val('プレイヤー'),
      val('レベル') && 'レベル' + val('レベル'), val('クラス'), val('種族')].filter(Boolean).join(' / ');

    f('chips').replaceChildren(...[
      ...d.status.map(s => `${s.label} ${s.value}/${s.max}`),
      val('AC') && 'AC ' + val('AC'),
      `イニシアチブ ${d.initiative >= 0 ? '+' : ''}${d.initiative}`,
      `パラメータ ${d.params.length}件`,
    ].filter(Boolean).map(chip));

    const missing = C.unresolvedReferences(out);
    f('warn').classList.toggle('hidden', !missing.length);
    f('warn').textContent = missing.length
      ? `パレット中の参照がパラメータに見つかりません: ${missing.map(m => `{${m}}`).join(' ')}　— ココフォリアではこの部分が数値に置き換わりません。`
      : '';

    f('palette').textContent = d.commands;
    f('memo').textContent = d.memo;
    entry.json = JSON.stringify(out, null, 2);
    f('json').textContent = entry.json;
  }

  function addEntry(parsed) {
    const el = $('result-tpl').content.firstElementChild.cloneNode(true);
    const fields = new Map([...el.querySelectorAll('[data-f]')].map(node => [node.dataset.f, node]));
    const entry = { parsed, el, fields };
    el.querySelector('[data-a="copy"]').addEventListener('click', e => copy(entry, e.currentTarget));
    el.querySelector('[data-a="save"]').addEventListener('click', () =>
      download(new Blob([entry.json], { type: 'application/json' }), safeName(parsed.name) + '_ccfolia.json'));
    entries.push(entry);
    results.append(el);
    wireTips(el);
    render(entry);
    return entry;
  }

  function clearEntries() { entries = []; results.replaceChildren(); }

  // ---- コピー・保存
  function copyWithExecCommand(text) {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    try { return document.execCommand('copy'); } finally { ta.remove(); }
  }

  async function copy(entry, btn) {
    const text = JSON.stringify(entry.out);
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try { ok = copyWithExecCommand(text); } catch { ok = false; }
    }
    if (!ok) { setMsg('クリップボードにコピーできませんでした。「JSON」欄の内容を手動でコピーしてください。', 'err'); return; }
    btn.textContent = 'コピーしました ✓';
    setMsg(`「${entry.out.data.name}」をコピーしました。ココフォリアの盤面で貼り付けてください。`, 'ok');
    clearTimeout(btn.resetTimer);
    btn.resetTimer = setTimeout(() => { btn.textContent = 'ココフォリア用にコピー'; }, 1800);
  }

  function download(blob, name) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    // すぐに無効にすると、Firefox が重いときにダウンロードが中身を読む前に消えて保存が終わらない。
    // 1秒では足りないことがE2Eで分かったので、十分に待ってから無効にする
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  }

  const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'character';

  // ---- ファイルから
  async function handleFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    if (files.length > C.LIMITS.maxBatchFiles || files.reduce((sum, file) => sum + file.size, 0) > C.LIMITS.maxInputBytes) {
      setMsg(`一度に読み込めるのは ${C.LIMITS.maxBatchFiles}ファイル、合計20MBまでです。分けて読み込んでください。`, 'err');
      return;
    }
    const gen = ++loadGeneration;
    clearEntries();
    setMsg('読み込み中…');
    // 1件ずつ読み込み、同時展開によるメモリ消費を抑える。新しい選択が来たら中断する。
    const loaded = [];
    let totalXmlBytes = 0;
    let totalCharacters = 0;
    for (const file of files) {
      if (gen !== loadGeneration) return;
      try {
        if (file.size > C.LIMITS.maxInputBytes) {
          throw new Error(`ファイルが大きすぎます（上限 ${Math.round(C.LIMITS.maxInputBytes / 1024 / 1024)}MB）。`);
        }
        const xmls = await C.extractXmlTexts(await file.arrayBuffer(), file.name);
        totalXmlBytes += xmls.reduce((sum, x) => sum + new TextEncoder().encode(x.xml).length, 0);
        totalCharacters += xmls.length;
        if (totalXmlBytes > C.LIMITS.maxTotalXmlBytes || totalCharacters > C.LIMITS.maxBatchFiles) {
          throw new Error('変換対象が多すぎます（XML合計20MB、50体まで）。分けて読み込んでください。');
        }
        loaded.push({ chars: xmls.map(x => C.parseUdonariumXml(x.xml)) });
      } catch (err) {
        loaded.push({ error: `${file.name}: ${err.message}` });
      }
    }
    if (gen !== loadGeneration) return;

    const chars = loaded.flatMap(r => r.chars || []);
    const errors = loaded.map(r => r.error).filter(Boolean);
    chars.forEach(addEntry);
    const lines = [chars.length ? `変換しました（${chars.length}体）。` : '', ...errors].filter(Boolean);
    setMsg(lines.join('\n'), errors.length ? 'err' : 'ok');
  }

  const drop = $('drop');
  const input = $('file-input');
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { handleFiles(input.files); input.value = ''; });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); handleFiles(e.dataTransfer.files); });

  // E2Eテストが「初期化が終わった」ことを待てるようにする
  document.documentElement.dataset.ready = 'true';
})();
