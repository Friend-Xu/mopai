# -*- coding: utf-8 -*-
"""
app.py — 墨排 Mopai 桌面入口
pywebview 窗口 + 暴露给前端的 Python API：
  - open_file()      原生对话框打开 .md 文件
  - open_folder()    原生对话框打开文章文件夹（MD + 相对路径图片映射）
  - pick_images()    多选图片，返回 dataURI 列表
  - upload_image()   SM.MS 图床上传（Python 直连，无 CORS 限制）
  - copy_html()      以 CF_HTML 格式写入剪贴板（公众号编辑器认这个格式）
"""
import base64
import ctypes
import json
import mimetypes
import os
import urllib.request

import webview

IMAGE_EXTS = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp')
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # SM.MS 免费版单张上限


class Api:
    def __init__(self):
        self._window = None

    # ---------- 文件 / 文件夹 ----------

    def open_file(self, path=None):
        """打开 Markdown 文件，返回 {name, content}。path 为空时弹原生对话框"""
        if not path:
            result = self._window.create_file_dialog(
                webview.OPEN_DIALOG,
                file_types=('Markdown 文件 (*.md;*.markdown;*.txt)', '所有文件 (*.*)')
            )
            if not result:
                return None
            path = result[0]
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        return {'name': os.path.basename(path), 'content': content}

    def open_folder(self, path=None):
        """打开文章文件夹：读第一个 MD + 扫描全部图片为 dataURI 映射。
        path 为空时弹原生对话框"""
        if not path:
            result = self._window.create_file_dialog(webview.FOLDER_DIALOG)
            if not result:
                return None
            path = result[0]
        folder = path

        mds = sorted(f for f in os.listdir(folder)
                     if f.lower().endswith(('.md', '.markdown')))
        if not mds:
            return {'error': '该文件夹中没有 Markdown 文件'}

        with open(os.path.join(folder, mds[0]), 'r', encoding='utf-8') as f:
            content = f.read()

        images = {}
        skipped = []
        for root, _dirs, files in os.walk(folder):
            for fn in files:
                ext = os.path.splitext(fn)[1].lower()
                if ext not in IMAGE_EXTS:
                    continue
                full = os.path.join(root, fn)
                size = os.path.getsize(full)
                rel = os.path.relpath(full, folder).replace('\\', '/')
                if size > MAX_IMAGE_BYTES:
                    skipped.append(rel)
                    continue
                with open(full, 'rb') as f:
                    b64 = base64.b64encode(f.read()).decode('ascii')
                mime = mimetypes.guess_type(fn)[0] or 'image/png'
                images[rel] = 'data:%s;base64,%s' % (mime, b64)

        return {
            'name': mds[0],
            'content': content,
            'images': images,
            'skipped': skipped
        }

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
