# -*- coding: utf-8 -*-
"""
app.py — 墨排 Mopai 桌面入口
pywebview 窗口 + 暴露给前端的 Python API：
  - open_file()      原生对话框打开 .md 文件（含所在目录图片扫描）
  - open_folder()    原生对话框打开文章文件夹（MD + 相对路径图片映射）
  - read_file()      轻量读取 md（文件栏切换用）
  - pick_images()    多选图片，返回 dataURI 列表
  - upload_image()   s.ee 图床上传（备选模式）
  - prepare_copy()   本地 HTTP 模式：dataURI → localhost URL（默认模式）
  - save_file()      写回 md 文件到磁盘
  - copy_html()      以 CF_HTML 格式写入剪贴板
"""
import base64
import ctypes
import http.server
import json
import mimetypes
import os
import re
import shutil
import socket
import tempfile
import threading
import time
import urllib.request

import webview

IMAGE_EXTS = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp')
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # s.ee 免费版单张上限


class Api:
    def __init__(self):
        self._window = None
        self._img_server = None
        self._img_port = None
        self._tmp_dir = None
        self._batch_counter = 0
        self._start_image_server()

    # ---------- 本地 HTTP 图片服务 ----------

    def _start_image_server(self):
        """启动常驻 HTTP 服务（127.0.0.1 + 随机端口），serve 临时目录"""
        self._tmp_dir = tempfile.mkdtemp(prefix='mopai_img_')
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('127.0.0.1', 0))
            self._img_port = s.getsockname()[1]

        tmp = self._tmp_dir

        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=tmp, **kwargs)
            def end_headers(self):
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
                self.send_header('Cache-Control', 'no-cache')
                super().end_headers()
            def do_OPTIONS(self):
                self.send_response(200)
                self.end_headers()
            def log_message(self, *args):
                pass

        self._img_server = http.server.HTTPServer(('127.0.0.1', self._img_port), Handler)
        t = threading.Thread(target=self._img_server.serve_forever, daemon=True)
        t.start()

    def _clean_old_batches(self, max_age=300):
        """清理超过 max_age 秒的批次目录"""
        if not os.path.isdir(self._tmp_dir):
            return
        now = time.time()
        for name in os.listdir(self._tmp_dir):
            path = os.path.join(self._tmp_dir, name)
            if os.path.isdir(path) and (now - os.path.getmtime(path)) > max_age:
                try:
                    shutil.rmtree(path)
                except Exception:
                    pass

    # ---------- 复制准备（本地 HTTP 模式） ----------

    _DATA_URI_RE = re.compile(r'data:image/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+')
    _MIME_EXT = {
        'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
        'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/bmp': '.bmp'
    }

    def _new_batch_dir(self):
        self._batch_counter += 1
        batch = 'b%d' % self._batch_counter
        batch_dir = os.path.join(self._tmp_dir, batch)
        os.makedirs(batch_dir, exist_ok=True)
        self._clean_old_batches()
        return batch, batch_dir

    def _replace_data_uris(self, text, batch, batch_dir):
        """把文本中的 dataURI 图片解码写临时文件，替换为 localhost URL。
        返回 (新文本, 图片数)"""
        counter = [0]

        def _replace(m):
            data_uri = m.group(0)
            header, b64 = data_uri.split(',', 1)
            mime = header.split(';')[0].split(':')[1]
            ext = self._MIME_EXT.get(mime, '.png')
            counter[0] += 1
            filename = 'img%d%s' % (counter[0], ext)
            with open(os.path.join(batch_dir, filename), 'wb') as f:
                f.write(base64.b64decode(b64))
            return 'http://127.0.0.1:%d/%s/%s' % (self._img_port, batch, filename)

        return self._DATA_URI_RE.sub(_replace, text), counter[0]

    def prepare_copy(self, html):
        """把 HTML 中的 dataURI 图片解码写到临时文件，替换为 localhost URL。
        返回 {html, imageCount}"""
        batch, batch_dir = self._new_batch_dir()
        result, count = self._replace_data_uris(html, batch, batch_dir)
        return {'html': result, 'imageCount': count}

    def prepare_markdown(self, md):
        """把 Markdown 源码中的 dataURI 图片替换为 localhost URL（复制源码用）。
        返回 {markdown, imageCount}"""
        batch, batch_dir = self._new_batch_dir()
        result, count = self._replace_data_uris(md, batch, batch_dir)
        return {'markdown': result, 'imageCount': count}

    # ---------- 文件保存 ----------

    def save_file(self, path, content):
        """把编辑器内容写回磁盘 md 文件"""
        try:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            return {'ok': True}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    # ---------- 文件 / 文件夹 ----------

    def _scan_images(self, base_dir):
        """递归扫描目录图片为 {相对路径: dataURI}，超 5MB 记入 skipped"""
        images = {}
        skipped = []
        for root, _dirs, files in os.walk(base_dir):
            for fn in files:
                ext = os.path.splitext(fn)[1].lower()
                if ext not in IMAGE_EXTS:
                    continue
                full = os.path.join(root, fn)
                size = os.path.getsize(full)
                rel = os.path.relpath(full, base_dir).replace('\\', '/')
                if size > MAX_IMAGE_BYTES:
                    skipped.append(rel)
                    continue
                with open(full, 'rb') as f:
                    b64 = base64.b64encode(f.read()).decode('ascii')
                mime = mimetypes.guess_type(fn)[0] or 'image/png'
                images[rel] = 'data:%s;base64,%s' % (mime, b64)
        return images, skipped

    def _list_md(self, base_dir):
        """递归列出目录内全部 Markdown 文件（相对路径，正斜杠，排序）"""
        out = []
        for root, _dirs, files in os.walk(base_dir):
            for fn in files:
                if fn.lower().endswith(('.md', '.markdown')):
                    rel = os.path.relpath(os.path.join(root, fn), base_dir).replace('\\', '/')
                    out.append(rel)
        return sorted(out)

    def _load_article(self, md_path, base_dir=None):
        """读 md + 扫描 base 目录图片 + 列出 base 目录内 md。base 默认为 md 所在目录"""
        md_path = os.path.abspath(md_path)
        base = os.path.abspath(base_dir) if base_dir else os.path.dirname(md_path)
        with open(md_path, 'r', encoding='utf-8') as f:
            content = f.read()
        images, skipped = self._scan_images(base)
        return {
            'name': os.path.basename(md_path),
            'path': md_path,
            'dir': base,
            'content': content,
            'images': images,
            'skipped': skipped,
            'files': self._list_md(base)
        }

    def open_file(self, path=None):
        """打开 Markdown 文件：读内容 + 扫描所在目录图片 + 列出同目录 md。
        path 为空时弹原生对话框"""
        if not path:
            result = self._window.create_file_dialog(
                webview.OPEN_DIALOG,
                file_types=('Markdown 文件 (*.md;*.markdown;*.txt)', '所有文件 (*.*)')
            )
            if not result:
                return None
            path = result[0]
        return self._load_article(path)

    def open_folder(self, path=None):
        """打开文章文件夹：读第一个 MD + 扫描全部图片 + 列出全部 md。
        path 为空时弹原生对话框"""
        if not path:
            result = self._window.create_file_dialog(webview.FOLDER_DIALOG)
            if not result:
                return None
            path = result[0]
        mds = self._list_md(path)
        if not mds:
            return {'error': '该文件夹中没有 Markdown 文件'}
        return self._load_article(os.path.join(path, mds[0]), base_dir=path)

    def read_file(self, path):
        """轻量读取单个 md 内容（文件栏切换用，不重扫图片，沿用已加载映射）"""
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            return {'name': os.path.basename(path), 'path': os.path.abspath(path),
                    'content': content}
        except Exception as e:
            return {'error': str(e)}

    def pick_images(self):
        """原生多选图片对话框，返回 [{name, dataUri}]"""
        result = self._window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=True,
            file_types=('图片文件 (*.png;*.jpg;*.jpeg;*.gif;*.webp)', '所有文件 (*.*)')
        )
        if not result:
            return []
        out = []
        for path in result:
            if os.path.getsize(path) > MAX_IMAGE_BYTES:
                continue
            with open(path, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode('ascii')
            mime = mimetypes.guess_type(path)[0] or 'image/png'
            out.append({
                'name': os.path.basename(path),
                'dataUri': 'data:%s;base64,%s' % (mime, b64)
            })
        return out

    # ---------- 图床上传 ----------

    def upload_image(self, data_uri, token):
        """上传单张图片到 SM.MS，返回 {ok, url} 或 {ok, error}"""
        if not token:
            return {'ok': False, 'error': '未配置图床 API Key'}
        try:
            b64 = data_uri.split(',', 1)[1] if ',' in data_uri else data_uri
            raw = base64.b64decode(b64)
            if len(raw) > MAX_IMAGE_BYTES:
                return {'ok': False, 'error': '图片超过 5MB 限制'}

            boundary = '----MopaiPythonBoundary'
            body = b''.join([
                ('--%s\r\nContent-Disposition: form-data; name="smfile"; '
                 'filename="mopai-upload.png"\r\n'
                 'Content-Type: image/png\r\n\r\n' % boundary).encode('ascii'),
                raw,
                ('\r\n--%s--\r\n' % boundary).encode('ascii')
            ])
            req = urllib.request.Request(
                'https://s.ee/api/v1/file/upload',
                data=body,
                headers={
                    'Authorization': token,
                    'Content-Type': 'multipart/form-data; boundary=%s' % boundary,
                    'User-Agent': 'Mopai/2.0'
                }
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                resp = json.loads(r.read().decode('utf-8'))

            if resp.get('success') and resp.get('data') and resp['data'].get('url'):
                return {'ok': True, 'url': resp['data']['url']}
            if resp.get('code') == 'image_repeated':
                return {'ok': True, 'url': resp.get('images')}
            return {'ok': False, 'error': resp.get('message', '图床未知错误')}
        except urllib.error.HTTPError as e:
            if e.code == 401:
                return {'ok': False, 'error': 'API Key 无效，请检查 ⚙ 设置'}
            if e.code == 413:
                return {'ok': False, 'error': '图片超过图床大小限制'}
            return {'ok': False, 'error': '图床 HTTP %d' % e.code}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    # ---------- 剪贴板（CF_HTML） ----------

    def copy_html(self, html):
        """以 CF_HTML + CF_UNICODETEXT 双格式写入 Windows 剪贴板"""
        try:
            _set_clipboard_html(html)
            return {'ok': True}
        except Exception as e:
            return {'ok': False, 'error': str(e)}


# ---------- Windows CF_HTML 实现 ----------

def _build_cf_html(fragment):
    """构造 CF_HTML 剪贴板格式（偏移量为字节偏移）"""
    frag = fragment.encode('utf-8')
    prefix = '<html>\r\n<body>\r\n<!--StartFragment-->\r\n'.encode('ascii')
    suffix = '\r\n<!--EndFragment-->\r\n</body>\r\n</html>'.encode('ascii')
    header_fmt = ('Version:0.9\r\n'
                  'StartHTML:%010d\r\n'
                  'EndHTML:%010d\r\n'
                  'StartFragment:%010d\r\n'
                  'EndFragment:%010d\r\n')
    dummy = (header_fmt % (0, 0, 0, 0)).encode('ascii')
    start_html = len(dummy)
    start_fragment = start_html + len(prefix)
    end_fragment = start_fragment + len(frag)
    end_html = end_fragment + len(suffix)
    header = (header_fmt % (start_html, end_html, start_fragment, end_fragment)).encode('ascii')
    return header + prefix + frag + suffix


def _setup_win32():
    """声明 Win32 函数签名（64 位句柄/指针，防止 ctypes 默认 int 截断）"""
    kernel32 = ctypes.windll.kernel32
    user32 = ctypes.windll.user32
    kernel32.GlobalAlloc.restype = ctypes.c_void_p
    kernel32.GlobalAlloc.argtypes = [ctypes.c_uint, ctypes.c_size_t]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalLock.argtypes = [ctypes.c_void_p]
    kernel32.GlobalUnlock.argtypes = [ctypes.c_void_p]
    kernel32.GlobalFree.argtypes = [ctypes.c_void_p]
    kernel32.GlobalSize.restype = ctypes.c_size_t
    kernel32.GlobalSize.argtypes = [ctypes.c_void_p]
    user32.SetClipboardData.restype = ctypes.c_void_p
    user32.SetClipboardData.argtypes = [ctypes.c_uint, ctypes.c_void_p]
    user32.GetClipboardData.restype = ctypes.c_void_p
    user32.GetClipboardData.argtypes = [ctypes.c_uint]
    user32.OpenClipboard.argtypes = [ctypes.c_void_p]
    user32.RegisterClipboardFormatW.restype = ctypes.c_uint
    user32.RegisterClipboardFormatW.argtypes = [ctypes.c_wchar_p]
    return kernel32, user32


def _set_clipboard_data(kernel32, user32, data_bytes, fmt):
    GMEM_MOVEABLE_ZEROINIT = 0x0042
    h = kernel32.GlobalAlloc(GMEM_MOVEABLE_ZEROINIT, len(data_bytes))
    if not h:
        raise OSError('GlobalAlloc failed')
    p = kernel32.GlobalLock(h)
    if not p:
        kernel32.GlobalFree(h)
        raise OSError('GlobalLock failed')
    ctypes.memmove(p, data_bytes, len(data_bytes))
    kernel32.GlobalUnlock(h)
    if not user32.SetClipboardData(fmt, h):
        kernel32.GlobalFree(h)
        raise OSError('SetClipboardData failed')


def _set_clipboard_html(html):
    kernel32, user32 = _setup_win32()
    cf_html = user32.RegisterClipboardFormatW('HTML Format')
    CF_UNICODETEXT = 13

    if not user32.OpenClipboard(None):
        raise OSError('OpenClipboard failed')
    try:
        user32.EmptyClipboard()
        _set_clipboard_data(kernel32, user32, _build_cf_html(html), cf_html)
        text = html.encode('utf-16-le') + b'\x00\x00'
        _set_clipboard_data(kernel32, user32, text, CF_UNICODETEXT)
    finally:
        user32.CloseClipboard()


# ---------- 启动 ----------

def main():
    api = Api()
    window = webview.create_window(
        '墨排 Mopai',
        'index.html',
        js_api=api,
        width=1360,
        height=880,
        min_size=(960, 640)
    )
    api._window = window
    webview.start(debug=False)


if __name__ == '__main__':
    main()
