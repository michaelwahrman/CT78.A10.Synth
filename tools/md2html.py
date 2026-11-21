#!/usr/bin/env python3
"""Shadow each .md in the project folder with a .html (Harness: every .md has an .html twin).  python3 tools/md2html.py"""
import glob, html, os, markdown
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS = ('body{max-width:980px;margin:24px auto;padding:0 16px;font:15px/1.55 "Segoe UI",Arial,sans-serif;background:#fbfaf7;color:#222}'
       'img{max-width:100%}table{border-collapse:collapse}td,th{padding:4px;vertical-align:top}code{background:#eee;padding:1px 4px;border-radius:3px}'
       'blockquote{color:#555;border-left:3px solid #ccc;margin-left:0;padding-left:12px}'
       '@media (prefers-color-scheme:dark){body{background:#1b1a21;color:#e8e4ef}code{background:#333}a{color:#9cf}}')
for md in glob.glob(os.path.join(root, '*.md')):
    body = markdown.markdown(open(md, encoding='utf-8').read(), extensions=['tables', 'fenced_code'])
    title = html.escape(os.path.basename(md)[:-3])
    open(md[:-3] + '.html', 'w', encoding='utf-8').write(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                                                         f'<title>{title}</title><style>{CSS}</style></head><body>\n{body}\n</body></html>\n')
    print('wrote', md[:-3] + '.html')
