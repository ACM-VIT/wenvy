#!/usr/bin/env python3
"""Minimal static file server that never calls os.getcwd()."""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

port = int(sys.argv[1])
directory = sys.argv[2]
handler = partial(SimpleHTTPRequestHandler, directory=directory)
ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
