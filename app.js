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
  // 性能計測（scripts/benchmark.mjs が読む）。load はファイル選択から全ファイルの処理が終わるまで
  const metrics = ['parse', 'convert', 'display', 'load'];
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

  // ---- 説明（ツールチップヘルプ）
  // .has-tip の中身によって2種類に分かれる。どちらも開いている説明は同時に1つだけ。
  // - 「?」ボタン（.tip-btn）: 押すと開き、もう一度押す・外側を押す・フォーカスを外す・Esc で閉じる（トグルチップ）。
  //   開閉は aria-expanded / aria-controls で伝える。同じ .has-tip 内の入力欄には aria-describedby で説明を結び付ける。
  // - ほかのボタンの補足（role="tooltip"）: マウスのある端末で TIP_DELAY ミリ秒乗せ続けたときと、
  //   キーボードでフォーカスしたとき（:focus-visible）だけ出す。押すと閉じる。マウスで説明の上に移っても消えない（WCAG 1.4.13）。
  //   タッチ端末では出さない（指を離したあともホバー扱いが残り、説明が画面をふさぐため）。説明は画面に出ていなくても読み上げられる。
  const TIP_DELAY = 400;
  const canHover = matchMedia('(hover: hover) and (pointer: fine)');
  const tipTimers = new WeakMap();
  let tipSeq = 0;

  /** 画面からはみ出さないよう、表示のたびに位置を調整する。右端を越えるなら左へずらし、下に収まらず上なら収まるときは上に出す */
  function placeTip(wrap) {
    const tip = wrap.querySelector(':scope > .tip');
    wrap.classList.remove('tip-above');
    tip.style.left = '';
    const box = tip.getBoundingClientRect();
    const over = box.right - (document.documentElement.clientWidth - 8);
    if (over > 0) tip.style.left = `${-over}px`;
    const above = wrap.getBoundingClientRect().top - box.height - 6;
    if (box.bottom > document.documentElement.clientHeight - 8 && above >= 8) wrap.classList.add('tip-above');
  }
  function hideTip(wrap) {
    clearTimeout(tipTimers.get(wrap));
    wrap.classList.remove('tip-open', 'tip-keyboard');
    wrap.querySelector(':scope > .tip-btn')?.setAttribute('aria-expanded', 'false');
  }
  function hideAllTips(except) {
    for (const wrap of document.querySelectorAll('.has-tip.tip-open')) if (wrap !== except) hideTip(wrap);
  }
  /** keyboard: キーボードのフォーカスで出したとき。説明が下にあるもののクリックを横取りしないようにする */
  function showTip(wrap, keyboard = false) {
    hideAllTips(wrap);
    clearTimeout(tipTimers.get(wrap));
    wrap.classList.add('tip-open');
    wrap.classList.toggle('tip-keyboard', keyboard);
    wrap.querySelector(':scope > .tip-btn')?.setAttribute('aria-expanded', 'true');
    placeTip(wrap);
  }

  /** root 内の .has-tip を使えるようにする（テンプレートを複製したあとにも呼ぶ） */
  function wireTips(root) {
    for (const wrap of root.querySelectorAll('.has-tip')) {
      const tip = wrap.querySelector(':scope > .tip');
      if (!tip || tip.id) continue;
      tip.id = `tip-${++tipSeq}`;
      const toggle = wrap.querySelector(':scope > .tip-btn');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', tip.id);
        for (const input of wrap.querySelectorAll('input')) input.setAttribute('aria-describedby', tip.id);
        toggle.addEventListener('click', () => (wrap.classList.contains('tip-open') ? hideTip(wrap) : showTip(wrap)));
        wrap.addEventListener('focusout', e => { if (e.relatedTarget && !wrap.contains(e.relatedTarget)) hideTip(wrap); });
        continue;
      }
      const target = wrap.querySelector('button');
      target.setAttribute('aria-describedby', tip.id);
      wrap.addEventListener('mouseenter', () => {
        if (!canHover.matches || wrap.classList.contains('tip-open')) return;
        clearTimeout(tipTimers.get(wrap));
        tipTimers.set(wrap, setTimeout(() => showTip(wrap), TIP_DELAY));
      });
      wrap.addEventListener('mouseleave', () => { if (!target.matches(':focus-visible')) hideTip(wrap); });
      target.addEventListener('focus', () => { if (target.matches(':focus-visible')) showTip(wrap, true); });
      target.addEventListener('blur', () => { if (!wrap.matches(':hover')) hideTip(wrap); });
      // 押したら閉じる（押したあとも説明が残って画面をふさがないように）。次に出すのはマウスを乗せ直したとき
      target.addEventListener('pointerdown', () => hideTip(wrap));
    }
  }
  // 「?」の説明は外側を押すと閉じる。click ではなく pointerdown で見る
  // （WebKit のタッチ操作では、見出しや余白のような押せない場所をタップしても click が起きないため）
  document.addEventListener('pointerdown', e => {
    for (const wrap of document.querySelectorAll('.has-tip.tip-open')) if (!wrap.contains(e.target)) hideTip(wrap);
  });
  // Esc で開いている説明を閉じる（次にマウスを乗せる・フォーカスする・「?」を押すまで）
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideAllTips();
  });

  // 説明文中の上限を converter.js の値で書き換える（文言と実際の上限がずれないように）
  const formatLimit = key => (key.endsWith('Bytes') ? C.formatMB(C.LIMITS[key]) : String(C.LIMITS[key]));
  for (const el of document.querySelectorAll('[data-limit]')) el.textContent = formatLimit(el.dataset.limit);
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
    requestAnimationFrame(flushRender);
  }
  /** 描き直し待ちがあれば今すぐ描き直す。コピー・保存の直前に呼び、常に今のオプションの結果を使う */
  function flushRender() {
    if (!renderQueued) return;
    renderQueued = false;
    const options = outputOptions();
    clearMetrics();
    entries.forEach(entry => render(entry, options));
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

    renderWarnings(entry, C.inspectConversion(out));
    const hasNotes = entry.parsed.sections.some(section => section.items.some(item => item.kind === 'note' && item.value));
    f('notice').textContent = '立ち絵は引き継がれません。貼り付け後に設定してください。' +
      (hasNotes && !options.includeNotes ? ' 背景などのメモは出力していません。必要なら出力オプションをオンにしてください。' : '');
    f('palette').textContent = d.commands;
    f('memo').textContent = d.memo;
    entry.json = JSON.stringify(out, null, 2);
    f('json').textContent = entry.json;
    performance.measure('udon:display', { start: displayStart, end: performance.now() });
  }

  const MAX_REFERENCE_LINKS = 20;
  const paragraph = text => Object.assign(document.createElement('p'), { textContent: text });

  /** 未解決の {参照} と同名の項目の警告。参照は行番号のボタンにし、押すとパレットの該当行を強調する */
  function renderWarnings(entry, checks) {
    const warn = entry.fields.get('warn');
    warn.replaceChildren();
    warn.classList.toggle('hidden', !checks.references.length && !checks.duplicates.length);
    if (checks.references.length) {
      warn.append(paragraph('パレット中の参照がパラメータに見つかりません。該当行を確認し、ココフォリアでパレットかパラメータを修正してください。'));
      const list = document.createElement('ul');
      for (const ref of checks.references.slice(0, MAX_REFERENCE_LINKS)) {
        const button = Object.assign(document.createElement('button'), {
          type: 'button', className: 'reference-link', textContent: `${ref.line}行目: ${ref.labels.map(label => `{${label}}`).join(' ')}`,
        });
        button.addEventListener('click', () => highlightPaletteLine(entry, ref.line));
        const item = document.createElement('li');
        item.append(button);
        list.append(item);
      }
      warn.append(list);
      const rest = checks.references.length - MAX_REFERENCE_LINKS;
      if (rest > 0) warn.append(`ほか${rest}行。JSONとパレットでも確認できます。`);
    }
    for (const duplicate of checks.duplicates) {
      warn.append(paragraph(`「${duplicate.label || '名称未設定'}」が${duplicate.count}件あります。参照する値が曖昧になるため、貼り付け前に元データの名前と値を確認してください。`));
    }
  }

  /** パレットの欄を開き、line 行目（1始まり）を <mark> で囲んでフォーカスする */
  function highlightPaletteLine(entry, line) {
    const palette = entry.fields.get('palette');
    palette.closest('details').open = true;
    const lines = entry.out.data.commands.split('\n');
    const mark = Object.assign(document.createElement('mark'), { textContent: lines[line - 1], tabIndex: -1 });
    const before = lines.slice(0, line - 1).join('\n');
    const after = lines.slice(line).join('\n');
    palette.replaceChildren(document.createTextNode(before + (line > 1 ? '\n' : '')), mark,
      document.createTextNode((line < lines.length ? '\n' : '') + after));
    mark.focus();
    mark.scrollIntoView({ block: 'nearest' });
  }

  function addEntry(parsed) {
    const el = $('result-tpl').content.firstElementChild.cloneNode(true);
    const fields = new Map([...el.querySelectorAll('[data-f]')].map(node => [node.dataset.f, node]));
    const entry = { parsed, el, fields };
    el.querySelector('[data-a="remove"]').addEventListener('click', () => {
      const index = entries.indexOf(entry);
      clearTimeout(entry.copyTimer);
      entries = entries.filter(item => item !== entry);
      el.remove();
      updateTools();
      (entries[Math.min(index, entries.length - 1)]?.el.querySelector('[data-a="remove"]') || $('drop')).focus();
      setMsg(`「${parsed.name}」の結果を削除しました。`, 'ok');
    });
    el.querySelector('[data-a="copy"]').addEventListener('click', e => copy(entry, e.currentTarget));
    el.querySelector('[data-a="save"]').addEventListener('click', () => {
      flushRender();
      download(new Blob([entry.json], { type: 'application/json' }), A.safeName(parsed.name) + '_ccfolia.json');
    });
    entries.push(entry);
    results.append(el);
    wireTips(el);
    render(entry);
    updateTools();
    return entry;
  }

  function clearEntries() {
    for (const entry of entries) clearTimeout(entry.copyTimer);
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
    flushRender();
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
    clearTimeout(entry.copyTimer);
    entry.copyTimer = setTimeout(() => { btn.textContent = 'ココフォリア用にコピー'; }, 1800);
  }

  function download(blob, name) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    // すぐに無効にすると、Firefox が重いときにダウンロードが中身を読む前に消えて保存が終わらない。
    // 1秒では足りないことがE2Eで分かったので、十分に待ってから無効にする
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  }

  // ---- 読み込み状態。世代番号で、キャンセル・選び直し後の古い処理を画面へ戻さない。
  // 1件ごとに画面の更新とキャンセル操作に処理を譲る。scheduler.yield() があれば、
  // 譲ったあとすぐに続きを実行できる（setTimeout は他のタイマーの後回しになる）
  const yieldToUI = globalThis.scheduler?.yield
    ? () => globalThis.scheduler.yield()
    : () => new Promise(resolve => setTimeout(resolve, 0));
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
    flushRender();
    try { download(A.createJsonZip(entries.map(entry => entry.out)), 'characters_ccfolia.zip'); }
    catch (err) { setMsg(err.message, 'err'); }
  });

  const tooManyFiles = () => `一度に読み込めるのは ${C.LIMITS.maxBatchFiles}ファイル、合計${C.formatMB(C.LIMITS.maxInputBytes)}までです。分けて読み込んでください。`;
  const tooManyCharacters = () => `変換対象が多すぎます（XML合計${C.formatMB(C.LIMITS.maxTotalXmlBytes)}、${C.LIMITS.maxBatchFiles}体まで）。分けて読み込んでください。`;

  /**
   * 1ファイル分を読み、キャラクターを結果に追加する。budget は今回の読み込み全体の残り（XMLのバイト数・体数）。
   * @returns {Promise<{count:number, errors:string[]} | null>} 途中でキャンセル・選び直しされたら null
   */
  async function loadFile(file, gen, budget) {
    let count = 0;
    const errors = [];
    try {
      const xmls = await C.extractXmlTexts(await file.arrayBuffer(), file.name);
      if (gen !== loadGeneration) return null;
      budget.bytes -= xmls.reduce((sum, x) => sum + x.bytes, 0);
      budget.characters -= xmls.length;
      if (budget.bytes < 0 || budget.characters < 0) throw new Error(tooManyCharacters());
      for (const xml of xmls) {
        await yieldToUI();
        if (gen !== loadGeneration) return null;
        try { addEntry(timed('parse', () => C.parseUdonariumXml(xml.xml))); count++; }
        catch (err) { errors.push(`${xml.name}: ${err.message}`); }
      }
    } catch (err) { errors.push(err.message); }
    return gen === loadGeneration ? { count, errors } : null;
  }

  async function handleFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    cancelLoad();
    if (files.length > C.LIMITS.maxBatchFiles || files.reduce((sum, file) => sum + file.size, 0) > C.LIMITS.maxInputBytes) {
      setMsg(tooManyFiles(), 'err');
      return;
    }
    const start = performance.now();
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
    const budget = { bytes: C.LIMITS.maxTotalXmlBytes, characters: C.LIMITS.maxBatchFiles };
    for (const [index, file] of files.entries()) {
      const row = fileRows[index];
      row.state = 'processing'; row.el.textContent = `${file.name}: 読み込み中`;
      $('load-label').textContent = `${index + 1} / ${files.length}ファイルを読み込み中`;
      setMsg(`読み込み中…（${index + 1} / ${files.length}）`);
      await yieldToUI();
      if (gen !== loadGeneration) return;
      const result = await loadFile(file, gen, budget);
      if (!result) return;
      const { count, errors: fileErrors } = result;
      row.state = fileErrors.length ? (count ? 'partial' : 'error') : 'success';
      row.el.textContent = `${file.name}: ${fileErrors.length ? (count ? '一部成功' : '失敗') : '成功'}（${count}体）` +
        (fileErrors.length ? ` — ${fileErrors.join(' / ')}` : '');
      errors.push(...fileErrors.map(error => error.startsWith(file.name + ':') ? error : `${file.name}: ${error}`));
      $('load-progress').value = index + 1;
    }
    finishLoading();
    performance.measure('udon:load', { start, end: performance.now() });
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
