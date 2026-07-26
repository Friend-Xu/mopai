# -*- coding: utf-8 -*-
"""CDP 调试工具：在运行中的墨排应用窗口里执行 JS 并返回结果。
用法: runtime\\python.exe test\\cdp_eval.py "JS表达式"
"""
import json
import sys
import urllib.request

import websocket

CDP_PORT = 9222


def get_page_ws():
    with urllib.request.urlopen('http://localhost:%d/json' % CDP_PORT) as r:
        targets = json.loads(r.read())
    for t in targets:
        if t.get('type') == 'page' and 'index.html' in t.get('url', ''):
            return t['webSocketDebuggerUrl']
    raise RuntimeError('app page not found; is the app running with CDP port %d?' % CDP_PORT)


def evaluate(expr):
    ws = websocket.create_connection(get_page_ws(), timeout=15, suppress_origin=True)
    try:
        ws.send(json.dumps({
            'id': 1,
            'method': 'Runtime.evaluate',
            'params': {
                'expression': expr,
                'returnByValue': True,
                'awaitPromise': True
            }
        }))
        while True:
            msg = json.loads(ws.recv())
            if msg.get('id') == 1:
                result = msg.get('result', {})
                if 'exceptionDetails' in result:
                    return {'error': result['exceptionDetails'].get('text'),
                            'detail': str(result['exceptionDetails'].get('exception', {}).get('description', ''))[:500]}
                return result.get('result', {}).get('value')
    finally:
        ws.close()


if __name__ == '__main__':
    expr = sys.argv[1] if len(sys.argv) > 1 else 'document.title'
    out = evaluate(expr)
    print(json.dumps(out, ensure_ascii=False, indent=2, default=str))
