#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
subset-fonts.py — 官网字体子集化（源泉圆体 GenSen Rounded 2 TW）

用法（在仓库根目录）：
    .venv/bin/python tools/subset-fonts.py

输入：tools/fonts-src/GenSenRounded2TW-{R,B}.otf（15-16MB 完整版，已被 .gitignore 排除）
输出：assets/fonts/GenSenRounded2TW-{R,B}.subset.woff2

字符集来源（保持子集最小，文案改了重跑本脚本即可）：
  - index.html 全部文本节点（去掉 script/style/标签后的可见文本）
  - assets/js/*.js 与 assets/css/*.css 中出现的 CJK 字符与全角标点（兜底注入文案）
  - ASCII 可打印字符 + 数字 + 常用全角标点

OFL 说明：本字体 SIL OFL 1.1，Reserved Font Name 为 'Source'（源自 Adobe Source Han），
'GenSenRounded2TW' 不含 RFN，子集保留原 family 名不改名。
许可证全文：https://github.com/ButTaiwan/gensen-font（SIL_Open_Font_License_1.1.txt）
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PYFTSUBSET = ROOT / '.venv' / 'bin' / 'pyftsubset'
SRC_DIR = ROOT / 'tools' / 'fonts-src'
OUT_DIR = ROOT / 'assets' / 'fonts'

FONTS = {
    'GenSenRounded2TW-R': SRC_DIR / 'GenSenRounded2TW-R.otf',
    'GenSenRounded2TW-B': SRC_DIR / 'GenSenRounded2TW-B.otf',
}

FULLWIDTH_PUNCT = '，。、；：？！""''（）《》·—…「」『』〈〉【】～％＃＠＆＊＋－＝｜'

TAG_RE = re.compile(r'<[^>]+>')
SCRIPT_STYLE_RE = re.compile(r'<(script|style)[^>]*>.*?</\1>', re.S | re.I)
CJK_RE = re.compile(
    r'[一-鿿㐀-䶿豈-﫿＀-￯]'
)


def collect_chars() -> str:
    chars = set()

    # 1. index.html 可见文本
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    html = SCRIPT_STYLE_RE.sub(' ', html)
    text = TAG_RE.sub(' ', html)
    import html as html_mod
    chars.update(html_mod.unescape(text))

    # 2. JS / CSS 里的 CJK 与全角字符（字符串兜底）
    for path in list((ROOT / 'assets' / 'js').glob('*.js')) + \
                list((ROOT / 'assets' / 'css').glob('*.css')):
        chars.update(CJK_RE.findall(path.read_text(encoding='utf-8')))

    # 3. ASCII 可打印 + 全角标点
    chars.update(chr(c) for c in range(0x20, 0x7F))
    chars.update(FULLWIDTH_PUNCT)

    # 去掉空白控制字符，保留空格
    chars = {c for c in chars if c == ' ' or not c.isspace()}
    return ''.join(sorted(chars))


def subset_one(name: str, src: Path, charset_file: Path) -> int:
    out = OUT_DIR / f'{name}.subset.woff2'
    cmd = [
        str(PYFTSUBSET), str(src),
        f'--output-file={out}',
        '--flavor=woff2',
        f'--text-file={charset_file}',
        '--name-IDs=*',            # 保留 name 表（含版权/许可信息，OFL 要求）
        '--layout-features=rvrn,kern,liga,clig,calt,ccmp,locl,mark,mkmk',
    ]
    subprocess.run(cmd, check=True)
    return out.stat().st_size


def main() -> int:
    if not PYFTSUBSET.exists():
        print('缺少 .venv，请先：python3 -m venv .venv && .venv/bin/pip install fonttools brotli',
              file=sys.stderr)
        return 1
    for name, src in FONTS.items():
        if not src.exists():
            print(f'缺少字体源文件：{src}（下载地址见 README / 本文件 docstring）', file=sys.stderr)
            return 1

    charset = collect_chars()
    charset_file = ROOT / 'tools' / '.charset.txt'
    charset_file.write_text(charset, encoding='utf-8')
    cjk_count = sum(1 for c in charset if ord(c) > 0x2E7F)
    print(f'字符集：共 {len(charset)} 字符（其中 CJK 等 {cjk_count}）')

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, src in FONTS.items():
        size = subset_one(name, src, charset_file)
        print(f'{name}.subset.woff2  {size/1024:.1f} KB')
    charset_file.unlink()
    return 0


if __name__ == '__main__':
    sys.exit(main())
