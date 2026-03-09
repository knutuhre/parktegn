#!/usr/bin/env python3
"""
Local development server with CORS proxy for Vegvesen Parking Registry API.
Serves static files and proxies API requests to the Vegvesen API.
"""

import http.server
import urllib.request
import urllib.parse
import urllib.error
import json
import os
import sys
import ssl

PORT = int(os.environ.get('PORT', 8080))
VEGVESEN_BASE = 'https://parkreg-open.atlas.vegvesen.no/ws/no/vegvesen/veg/parkeringsomraade/parkeringsregisteret/v1'
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    """Handles static files and proxies /api/* requests to Vegvesen."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):
        if self.path.startswith('/api/'):
            self._proxy_request()
        elif self.path.startswith('/maps/'):
            self._proxy_maps()
        elif self.path.startswith('/streetview/'):
            self._proxy_streetview()
        else:
            super().do_GET()

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self._add_cors_headers()
        self.end_headers()

    def _proxy_request(self):
        # Strip /api/ prefix and build Vegvesen URL
        api_path = self.path[5:]  # Remove '/api/'
        target_url = VEGVESEN_BASE + '/' + api_path

        try:
            # Create SSL context that doesn't verify (for dev only)
            ctx = ssl.create_default_context()
            
            req = urllib.request.Request(target_url)
            req.add_header('User-Agent', 'ParkTegn/1.0')
            req.add_header('Accept', 'application/json, application/pdf, */*')

            with urllib.request.urlopen(req, timeout=120, context=ctx) as response:
                content_type = response.headers.get('Content-Type', 'application/octet-stream')
                data = response.read()

                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(data)))
                self._add_cors_headers()
                self.end_headers()
                self.wfile.write(data)

        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self._add_cors_headers()
            self.end_headers()
            error_msg = json.dumps({'error': f'Vegvesen API error: {e.code} {e.reason}'})
            self.wfile.write(error_msg.encode())

        except Exception as e:
            self.send_response(502)
            self._add_cors_headers()
            self.end_headers()
            error_msg = json.dumps({'error': f'Proxy error: {str(e)}'})
            self.wfile.write(error_msg.encode())

    def _proxy_maps(self):
        """Proxy satellite image requests using Google Maps satellite tiles (top-down ortofoto)."""
        try:
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)

            lat = float(params.get('lat', [59.9139])[0])
            lng = float(params.get('lng', [10.7522])[0])
            zoom = int(params.get('zoom', [19])[0])

            import math

            # Convert lat/lng to tile coordinates
            n = 2 ** zoom
            x_tile = int((lng + 180.0) / 360.0 * n)
            y_tile = int((1.0 - math.log(math.tan(math.radians(lat)) + 1.0 / math.cos(math.radians(lat))) / math.pi) / 2.0 * n)

            # Fetch a grid of tiles and stitch them
            grid_size = 5  # 5x5 grid = 1280x1280
            tile_size = 256
            half = grid_size // 2

            try:
                from PIL import Image as PILImage
                import io

                result_img = PILImage.new('RGB', (grid_size * tile_size, grid_size * tile_size))

                ctx = ssl.create_default_context()

                for dy in range(grid_size):
                    for dx in range(grid_size):
                        tx = x_tile - half + dx
                        ty = y_tile - half + dy
                        tile_url = f'https://mt1.google.com/vt/lyrs=s&x={tx}&y={ty}&z={zoom}'

                        req = urllib.request.Request(tile_url)
                        req.add_header('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')

                        try:
                            with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                                tile_data = resp.read()
                                tile_img = PILImage.open(io.BytesIO(tile_data))
                                result_img.paste(tile_img, (dx * tile_size, dy * tile_size))
                        except Exception:
                            pass  # Skip failed tiles

                buf = io.BytesIO()
                result_img.save(buf, format='PNG')
                data = buf.getvalue()

            except ImportError:
                # PIL not available – return single center tile
                ctx = ssl.create_default_context()
                tile_url = f'https://mt1.google.com/vt/lyrs=s&x={x_tile}&y={y_tile}&z={zoom}'
                req = urllib.request.Request(tile_url)
                req.add_header('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')

                with urllib.request.urlopen(req, timeout=30, context=ctx) as response:
                    data = response.read()

            self.send_response(200)
            self.send_header('Content-Type', 'image/png')
            self.send_header('Content-Length', str(len(data)))
            self._add_cors_headers()
            self.end_headers()
            self.wfile.write(data)

        except Exception as e:
            self.send_response(502)
            self._add_cors_headers()
            self.end_headers()
            error_msg = json.dumps({'error': f'Maps proxy error: {str(e)}'})
            self.wfile.write(error_msg.encode())

    def _proxy_streetview(self):
        """Proxy Google Street View images from cbk0 endpoint."""
        try:
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)

            lat = float(params.get('lat', [59.9139])[0])
            lng = float(params.get('lng', [10.7522])[0])
            heading = int(params.get('heading', [0])[0])
            pitch = int(params.get('pitch', [0])[0])
            fov = int(params.get('fov', [90])[0])

            sv_url = (
                f'https://cbk0.googleapis.com/cbk?output=thumbnail'
                f'&w=800&h=450&ll={lat},{lng}'
                f'&yaw={heading}&pitch={pitch}&thumbfov={fov}'
            )

            ctx = ssl.create_default_context()
            req = urllib.request.Request(sv_url)
            req.add_header('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')

            with urllib.request.urlopen(req, timeout=15, context=ctx) as response:
                data = response.read()
                content_type = response.headers.get('Content-Type', 'image/jpeg')
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(data)))
                self._add_cors_headers()
                self.end_headers()
                self.wfile.write(data)

        except Exception as e:
            self.send_response(502)
            self._add_cors_headers()
            self.end_headers()
            error_msg = json.dumps({'error': f'Street View proxy error: {str(e)}'})
            self.wfile.write(error_msg.encode())

    def _add_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')

    def end_headers(self):
        # Set correct MIME types for JS modules
        if self.path.endswith('.js'):
            # Override content type for .js files
            pass
        super().end_headers()

    def guess_type(self, path):
        """Override to ensure .js files get correct MIME type."""
        if path.endswith('.js'):
            return 'application/javascript'
        if path.endswith('.mjs'):
            return 'application/javascript'
        return super().guess_type(path)


if __name__ == '__main__':
    print(f'🅿️  ParkTegn Server')
    print(f'   Serving static files from: {STATIC_DIR}')
    print(f'   API proxy: /api/* → {VEGVESEN_BASE}/')
    print(f'   Open: http://localhost:{PORT}')
    print()

    server = http.server.HTTPServer(('', PORT), ProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
        server.server_close()
