// 配信するHTMLの Content Security Policy に、安全のために必須の指定が入っていることを確かめる。
// （CSP を書き換えたときに、うっかり外部通信やインラインスクリプトを許してしまわないように）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);

/** <meta http-equiv="Content-Security-Policy"> を {ディレクティブ: [値…]} にする */
function csp(html) {
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(meta, 'CSP の meta タグがある');
  return Object.fromEntries(meta[1].split(';').map(part => part.trim().split(/\s+/)).filter(([name]) => name)
    .map(([name, ...values]) => [name, values]));
}

const REQUIRED = {
  'default-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'require-trusted-types-for': ["'script'"],
};

function assertRequired(policy) {
  for (const [name, values] of Object.entries(REQUIRED)) assert.deepEqual(policy[name], values, name);
  for (const [name, values] of Object.entries(policy)) {
    assert.ok(!values.includes("'unsafe-inline'") && !values.includes("'unsafe-eval'"), `${name} に unsafe-* が無い`);
    assert.ok(!values.some(v => /^(https?:|\*)/.test(v)), `${name} で外部のオリジンを許していない`);
  }
}

test('index.html: 外部通信・インラインスクリプト・HTML文字列の代入を禁止している', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  const policy = csp(html);
  assertRequired(policy);
  assert.deepEqual(policy['script-src'], ["'self'"]);
  assert.deepEqual(policy['connect-src'], ["'none'"]);
  // 作れるポリシーは XML 解析用の1つだけ（converter.js の XML_POLICY と同じ名前）
  assert.deepEqual(policy['trusted-types'], ['udon-xml']);
  assert.match(readFileSync(new URL('converter.js', root), 'utf8'), /const XML_POLICY = 'udon-xml';/);
  // CSP を守るため、インラインのスクリプト・イベント属性・style 属性を書かない
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/, 'インラインの <script> が無い');
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'onclick などのイベント属性が無い');
  assert.doesNotMatch(html, /\sstyle=/i, 'style 属性が無い');
  for (const [, src] of html.matchAll(/<script src="([^"]+)"/g)) assert.match(src, /^[\w-]+\.js$/, `${src} は同じ場所のファイル`);
});

test('manual.html: スクリプトを一切読み込まない', () => {
  const dir = mkdtempSync(join(tmpdir(), 'manual-'));
  try {
    const out = join(dir, 'manual.html');
    execFileSync('python3', [new URL('scripts/build-manual.py', root).pathname, out]);
    const html = readFileSync(out, 'utf8');
    const policy = csp(html);
    assertRequired(policy);
    assert.equal(policy['script-src'], undefined, 'script-src が無い（default-src none でスクリプト全面禁止）');
    assert.deepEqual(policy['trusted-types'], ["'none'"]);
    assert.doesNotMatch(html, /<script/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
