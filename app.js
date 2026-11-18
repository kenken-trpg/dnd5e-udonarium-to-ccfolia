/*
 * ブラウザ版のUI。変換そのものは converter.js（window.UdonCcfolia）が行う。
 * CSP でインラインスクリプトを禁止しているので、UIのコードはこのファイルに置く。
 */
(() => {
  'use strict';
  const C = window.UdonCcfolia;
  const A = window.UdonArchive;
  const $ = id => document.getElementById(id);
  const msg = $('msg');
  const results = $('results');
  /** @type {{parsed, out, el}[]} */
  let entries = [];
  // 読み込み中に次のファイルが来たら、古い読み込みの結果は捨てる
  let loadGeneration = 0;
  let fileRows = [];
  const metrics = ['parse', 'convert', 'display'];
  function clearMetrics() { metrics.forEach(name => performance.clearMeasures(`udon:${name}`)); }
  function timed(name, action) {
    const start = performance.now();
    try { return action(); } finally { performance.measure(`udon:${name}`, { start, end: performance.now() }); }
  }
  function updateTools() {
    $('result-tools').hidden = !entries.length && $('file-report').hidden;
    $('result-count').textContent = `変換結果 ${entries.length}体`;
    $('save-all').disabled = !entries.length || !$('loading').hidden;
  }

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
      clearMetrics();
      entries.forEach(entry => render(entry, options));
    });
  }
  for (const id of ['opt-notes', 'opt-expand', 'opt-color']) {
    $(id).addEventListener('input', () => { saveOptions(); renderAll(); });
  }

  // ---- 変換結果の表示
  const chip = text => Object.assign(document.createElement('span'), { className: 'chip', textContent: text });

  function render(entry, options = outputOptions()) {
    const out = timed('convert', () => C.toCcfolia(entry.parsed, options));
    const displayStart = performance.now();
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

    const checks = C.inspectConversion(out);
    const warn = f('warn');
    warn.replaceChildren();
    warn.classList.toggle('hidden', !checks.references.length && !checks.duplicates.length);
    if (checks.references.length) {
      warn.append(Object.assign(document.createElement('p'), { textContent: 'パレット中の参照がパラメータに見つかりません。該当行を確認し、ココフォリアでパレットかパラメータを修正してください。' }));
      const list = document.createElement('ul');
      for (const ref of checks.references.slice(0, 20)) {
        const item = document.createElement('li');
        const button = Object.assign(document.createElement('button'), {
          type: 'button', className: 'reference-link', textContent: `${ref.line}行目: ${ref.labels.map(label => `{${label}}`).join(' ')}`,
        });
        button.addEventListener('click', () => {
          const palette = f('palette');
          palette.closest('details').open = true;
          const lines = entry.out.data.commands.split('\n');
          const mark = Object.assign(document.createElement('mark'), { textContent: lines[ref.line - 1], tabIndex: -1 });
          const before = lines.slice(0, ref.line - 1).join('\n');
          const after = lines.slice(ref.line).join('\n');
          palette.replaceChildren(document.createTextNode(before + (ref.line > 1 ? '\n' : '')), mark,
            document.createTextNode((ref.line < lines.length ? '\n' : '') + after));
          mark.focus();
          mark.scrollIntoView({ block: 'nearest' });
        });
        item.append(button);
        list.append(item);
      }
      warn.append(list);
      if (checks.references.length > 20) warn.append(`ほか${checks.references.length - 20}行。JSONとパレットでも確認できます。`);
    }
    for (const duplicate of checks.duplicates) warn.append(Object.assign(document.createElement('p'), {
      textContent: `「${duplicate.label || '名称未設定'}」が${duplicate.count}件あります。参照する値が曖昧になるため、貼り付け前に元データの名前と値を確認してください。`,
    }));
    const hasNotes = entry.parsed.sections.some(section => section.items.some(item => item.kind === 'note' && item.value));
    f('notice').textContent = '立ち絵は引き継がれません。貼り付け後に設定してください。' +
      (hasNotes && !options.includeNotes ? ' 背景などのメモは出力していません。必要なら出力オプションをオンにしてください。' : '');
    f('palette').textContent = d.commands;
    f('memo').textContent = d.memo;
    entry.json = JSON.stringify(out, null, 2);
    f('json').textContent = entry.json;
    performance.measure('udon:display', { start: displayStart, end: performance.now() });
  }

  function addEntry(parsed) {
    const el = $('result-tpl').content.firstElementChild.cloneNode(true);
    const fields = new Map([...el.querySelectorAll('[data-f]')].map(node => [node.dataset.f, node]));
    const entry = { parsed, el, fields };
    el.querySelector('[data-a="remove"]').addEventListener('click', () => {
      const index = entries.indexOf(entry);
      clearTimeout(el.querySelector('[data-a="copy"]').resetTimer);
      entries = entries.filter(item => item !== entry);
      el.remove();
      updateTools();
      (entries[Math.min(index, entries.length - 1)]?.el.querySelector('[data-a="remove"]') || $('drop')).focus();
      setMsg(`「${parsed.name}」の結果を削除しました。`, 'ok');
    });
    el.querySelector('[data-a="copy"]').addEventListener('click', e => copy(entry, e.currentTarget));
    el.querySelector('[data-a="save"]').addEventListener('click', () => {
      render(entry);
      download(new Blob([entry.json], { type: 'application/json' }), safeName(parsed.name) + '_ccfolia.json');
    });
    entries.push(entry);
    results.append(el);
    wireTips(el);
    render(entry);
    updateTools();
    return entry;
  }

  function clearEntries() {
    for (const entry of entries) clearTimeout(entry.el.querySelector('[data-a="copy"]').resetTimer);
    entries = []; results.replaceChildren(); updateTools();
  }

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
    render(entry);
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

  const safeName = A.safeName;

  // ---- 読み込み状態。世代番号で、キャンセル・選び直し後の古い処理を画面へ戻さない。
  const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));
  function finishLoading() { $('loading').hidden = true; updateTools(); }
  function cancelLoad() {
    ++loadGeneration;
    for (const row of fileRows) if (row.state === 'pending' || row.state === 'processing') {
      row.state = 'cancelled'; row.el.textContent = `${row.name}: 中断`;
    }
    finishLoading();
  }
  $('cancel-load').addEventListener('click', () => {
    cancelLoad();
    setMsg(`読み込みを中断しました。変換済みの${entries.length}体はそのまま使えます。`);
    $('drop').focus();
  });
  $('clear-all').addEventListener('click', () => {
    cancelLoad(); clearEntries();
    $('file-status').replaceChildren(); fileRows = [];
    $('file-report').hidden = true;
    updateTools(); clearMetrics(); setMsg('結果をすべてクリアしました。'); $('drop').focus();
  });
  $('save-all').addEventListener('click', () => {
    // 描画待ちのフレームがあっても、現在のオプションで保存する。
    try {
      const options = outputOptions();
      const characters = entries.map(entry => C.toCcfolia(entry.parsed, options));
      download(A.createJsonZip(characters), 'characters_ccfolia.zip');
    }
    catch (err) { setMsg(err.message, 'err'); }
  });

  async function handleFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    cancelLoad();
    if (files.length > C.LIMITS.maxBatchFiles || files.reduce((sum, file) => sum + file.size, 0) > C.LIMITS.maxInputBytes) {
      setMsg(`一度に読み込めるのは ${C.LIMITS.maxBatchFiles}ファイル、合計20MBまでです。分けて読み込んでください。`, 'err');
      return;
    }
    const gen = ++loadGeneration;
    clearEntries(); clearMetrics();
    $('file-status').replaceChildren();
    $('file-report').hidden = false;
    $('loading').hidden = false;
    $('load-progress').max = files.length; $('load-progress').value = 0;
    fileRows = files.map(file => {
      const el = Object.assign(document.createElement('li'), { textContent: `${file.name}: 待機中` });
      $('file-status').append(el);
      return { name: file.name, el, state: 'pending' };
    });
    updateTools();
    const errors = [];
    let totalXmlBytes = 0;
    let totalCharacters = 0;
    for (const [index, file] of files.entries()) {
      if (gen !== loadGeneration) return;
      const row = fileRows[index];
      row.state = 'processing'; row.el.textContent = `${file.name}: 読み込み中`;
      $('load-label').textContent = `${index + 1} / ${files.length}ファイルを読み込み中`;
      setMsg(`読み込み中…（${index + 1} / ${files.length}）`);
      await yieldToUI();
      if (gen !== loadGeneration) return;
      let count = 0;
      const fileErrors = [];
      try {
        const xmls = await C.extractXmlTexts(await file.arrayBuffer(), file.name);
        if (gen !== loadGeneration) return;
        totalXmlBytes += xmls.reduce((sum, x) => sum + new TextEncoder().encode(x.xml).length, 0);
        totalCharacters += xmls.length;
        if (totalXmlBytes > C.LIMITS.maxTotalXmlBytes || totalCharacters > C.LIMITS.maxBatchFiles) {
          throw new Error('変換対象が多すぎます（XML合計20MB、50体まで）。分けて読み込んでください。');
        }
        for (const xml of xmls) {
          await yieldToUI();
          if (gen !== loadGeneration) return;
          try { addEntry(timed('parse', () => C.parseUdonariumXml(xml.xml))); count++; }
          catch (err) { fileErrors.push(`${xml.name}: ${err.message}`); }
        }
      } catch (err) { fileErrors.push(err.message); }
      if (gen !== loadGeneration) return;
      row.state = fileErrors.length ? (count ? 'partial' : 'error') : 'success';
      row.el.textContent = `${file.name}: ${fileErrors.length ? (count ? '一部成功' : '失敗') : '成功'}（${count}体）` +
        (fileErrors.length ? ` — ${fileErrors.join(' / ')}` : '');
      errors.push(...fileErrors.map(error => error.startsWith(file.name + ':') ? error : `${file.name}: ${error}`));
      $('load-progress').value = index + 1;
    }
    finishLoading();
    setMsg([entries.length ? `変換しました（${entries.length}体）。` : '', ...errors].filter(Boolean).join('\n'), errors.length ? 'err' : 'ok');
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
