"""Logos de marcas del catálogo, descargados por el servidor y cacheados en disco.

Solo se piden dominios del catálogo (nunca datos del usuario). Protecciones:
https, como mucho 3 redirecciones, sin IPs privadas, tamaño máximo, firma
de imagen comprobada, sin SVG; los ICO se convierten a PNG y se exige un
mínimo de 32 px. Un fallo deja una marca de "sin logo" que se reintenta
pasado un mes.
"""
import io
import ipaddress
import logging
import os
import re
import socket
import threading
import time
from html.parser import HTMLParser
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests

from .merchants import brand

log = logging.getLogger(__name__)

LOGO_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "logos")
MISS_TTL = 30 * 24 * 3600
NET_MISS_TTL = 6 * 3600  # la web no respondió: se reintenta antes
MAX_BYTES = 300 * 1024
MAX_HTML = 512 * 1024
MIN_PX = 32
OUT_PX = 128
TIMEOUT = (3, 5)
_UA = "Mozilla/5.0 (compatible; FinanceMaster/1.0; logo fetcher)"
_ID_RE = re.compile(r"^[a-z0-9_-]{1,64}$")

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _paths(brand_id: str) -> tuple[str, str]:
    return os.path.join(LOGO_DIR, f"{brand_id}.png"), os.path.join(LOGO_DIR, f"{brand_id}.miss")


def cached_path(brand_id: str) -> Optional[str]:
    png, _ = _paths(brand_id)
    return png if os.path.exists(png) else None


def _recent_miss(brand_id: str) -> bool:
    _, miss = _paths(brand_id)
    try:
        with open(miss) as f:
            ttl = NET_MISS_TTL if "net" in f.read() else MISS_TTL
        return time.time() - os.path.getmtime(miss) < ttl
    except OSError:
        return False


# ── Red segura ──────────────────────────────────────────────────────────────

def _public_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return False
    if not infos:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            return False
    return True


def _get(url: str, limit: int) -> Optional[tuple[str, bytes, str]]:
    """GET con redirecciones a mano (máx. 3), solo https y hosts públicos. -> (url final, cuerpo, content-type)."""
    for _ in range(4):
        u = urlparse(url)
        if u.scheme != "https" or not u.hostname or not _public_host(u.hostname):
            return None
        try:
            r = requests.get(url, headers={"User-Agent": _UA, "Accept": "*/*"}, timeout=TIMEOUT,
                             allow_redirects=False, stream=True)
        except requests.RequestException:
            return None
        try:
            if r.status_code in (301, 302, 303, 307, 308):
                loc = r.headers.get("Location")
                if not loc:
                    return None
                url = urljoin(url, loc)
                continue
            if r.status_code != 200:
                return None
            body = b""
            for chunk in r.iter_content(16384):
                body += chunk
                if len(body) > limit:
                    return None
            return url, body, (r.headers.get("Content-Type") or "").lower()
        finally:
            r.close()
    return None


# ── Búsqueda del icono en la portada ────────────────────────────────────────

class _IconLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.found: list[tuple[int, str]] = []

    def handle_starttag(self, tag, attrs):
        if tag != "link":
            return
        a = {k.lower(): (v or "") for k, v in attrs}
        rel = a.get("rel", "").lower().split()
        href = a.get("href", "").strip()
        if not href or href.startswith("data:") or href.lower().endswith(".svg") or "svg" in a.get("type", ""):
            return
        size = 0
        m = re.search(r"(\d+)x\d+", a.get("sizes", ""))
        if m:
            size = int(m.group(1))
        if "apple-touch-icon" in rel or "apple-touch-icon-precomposed" in rel:
            self.found.append((1000 + (size or 180), href))
        elif "icon" in rel:
            self.found.append((size or 16, href))


def _candidates(domain: str) -> list[str]:
    base = f"https://{domain}/"
    out: list[str] = []
    page = _get(base, MAX_HTML)
    if page and "html" in page[2]:
        p = _IconLinks()
        try:
            p.feed(page[1].decode("utf-8", "ignore"))
        except Exception:
            pass
        for _, href in sorted(p.found, reverse=True):
            out.append(urljoin(page[0], href))
    out += [urljoin(base, "/apple-touch-icon.png"), urljoin(base, "/favicon.ico")]
    seen, uniq = set(), []
    for u in out:
        if u not in seen:
            seen.add(u)
            uniq.append(u)
    return uniq[:6]


_MAGIC = (b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff", b"GIF87a", b"GIF89a", b"\x00\x00\x01\x00", b"RIFF")


def _decode(data: bytes):
    """Imagen RGBA validada (firma, sin SVG, el tamaño mayor de un ICO, mínimo 32 px) o None."""
    if not data.startswith(_MAGIC) or (data.startswith(b"RIFF") and data[8:12] != b"WEBP"):
        return None
    from PIL import Image
    try:
        img = Image.open(io.BytesIO(data))
        if img.format == "ICO":
            sizes = sorted(img.info.get("sizes") or [img.size], key=lambda s: s[0] * s[1])
            img.size = sizes[-1]
        img.load()
    except Exception:
        return None
    if min(img.size) < MIN_PX:
        return None
    return img.convert("RGBA")


def to_png(data: bytes) -> Optional[bytes]:
    """Valida la imagen y la deja como ficha PNG cuadrada de 128 px. None si no sirve."""
    img = _decode(data)
    return _tile(img) if img is not None else None


def _bbox_diff(img, bg) -> Optional[tuple]:
    """Caja de lo que se distingue del color de fondo `bg` (sobre ese mismo fondo)."""
    from PIL import Image, ImageChops
    base = Image.new("RGBA", img.size, bg + (255,))
    flat = Image.alpha_composite(base, img).convert("RGB")
    diff = ImageChops.difference(flat, Image.new("RGB", img.size, bg)).convert("L")
    return diff.point(lambda v: 255 if v > 24 else 0).getbbox()


def _tile(img):
    """Ficha cuadrada de 128 px pensada para verse dentro de un círculo:
    - con fondo propio (esquinas opacas del mismo color, no blanco): ese fondo
      llena la ficha y el dibujo se centra y amplía sobre él;
    - icono redondo o cuadrado lleno (sin fondo): llena el círculo;
    - logo suelto (transparente o sobre blanco): centrado sobre blanco.
    El dibujo se escala para que su diagonal quepa en el círculo, así los
    logos apaisados aprovechan el ancho sin cortarse."""
    from PIL import Image
    X, Y = img.size
    corners = [img.getpixel(p) for p in ((0, 0), (X - 1, 0), (0, Y - 1), (X - 1, Y - 1))]
    solid = all(c[3] >= 250 for c in corners) and all(
        max(abs(c[k] - corners[0][k]) for k in range(3)) < 24 for c in corners
    ) and min(corners[0][:3]) < 232
    bg = tuple(corners[0][:3]) if solid else (255, 255, 255)
    box = _bbox_diff(img, bg)
    if not box:
        if not solid:
            return None
        box = (0, 0, X, Y)  # icono de un solo color: la ficha es ese color
    w, h = box[2] - box[0], box[3] - box[1]
    if max(w, h) < 12 or min(w, h) < 0.12 * max(w, h):
        return None
    crop = img.crop(box)
    fit = 0.9  # diagonal del dibujo respecto al diámetro
    if not solid and 0.85 <= w / h <= 1.18:
        alpha = crop.getchannel("A").point(lambda v: 255 if v > 200 else 0)
        filled = sum(alpha.histogram()[255:]) / float(w * h)
        if filled > 0.72:
            fit = 1.44  # insignia redonda o cuadrada llena: ocupa todo el círculo
    k = OUT_PX * fit / (w * w + h * h) ** 0.5
    if solid and fit < 1.0:
        k = min(k, OUT_PX * 0.78 / max(w, h))  # deja respirar el fondo propio
    logo = crop.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    out = Image.new("RGBA", (OUT_PX, OUT_PX), bg + (255,))
    out.alpha_composite(logo, ((OUT_PX - logo.width) // 2, (OUT_PX - logo.height) // 2))
    buf = io.BytesIO()
    out.convert("RGB").save(buf, "PNG", optimize=True)
    return buf.getvalue()


def _download(domain: str, icon: Optional[str] = None) -> Optional[bytes]:
    """Ficha del logo, None si la web responde pero no tiene uno usable;
    ConnectionError si no respondió nada (fallo de red: se reintenta pronto).
    Si el catálogo fija un icono, se usa ese; si no, de los que ofrece la web
    se queda con el de más resolución real (los apple-touch-icon antiguos
    suelen ser peores que un favicon grande)."""
    reached = False
    if icon:
        got = _get(icon, MAX_BYTES)
        if got:
            reached = True
            img = _decode(got[1])
            if img is not None and (png := _tile(img)):
                return png
    best = None  # (lado menor, -orden, imagen)
    for n, url in enumerate(_candidates(domain)):
        got = _get(url, MAX_BYTES)
        if not got:
            continue
        reached = True
        img = _decode(got[1])
        if img is None:
            continue
        score = (min(min(img.size), 256), -n)
        if best is None or score > best[0]:
            best = (score, img)
    if best is not None:
        png = _tile(best[1])
        if png:
            return png
    if not reached:
        raise ConnectionError(domain)
    return None


def get_logo(brand_id: str) -> Optional[str]:
    """Ruta del PNG de la marca, descargándolo si hace falta. None si no hay logo."""
    if not _ID_RE.match(brand_id or ""):
        return None
    b = brand(brand_id)
    if not b or not b.get("domain"):
        return None
    hit = cached_path(brand_id)
    if hit or _recent_miss(brand_id):
        return hit
    with _locks_guard:
        lock = _locks.setdefault(brand_id, threading.Lock())
    with lock:
        hit = cached_path(brand_id)
        if hit or _recent_miss(brand_id):
            return hit
        os.makedirs(LOGO_DIR, exist_ok=True)
        png_path, miss_path = _paths(brand_id)
        kind = "bad"
        try:
            png = _download(b["domain"], b.get("icon"))
        except ConnectionError:
            png, kind = None, "net"
        except Exception:
            log.exception("logo %s", brand_id)
            png, kind = None, "net"
        if png:
            tmp = png_path + ".tmp"
            with open(tmp, "wb") as f:
                f.write(png)
            os.replace(tmp, png_path)
            if os.path.exists(miss_path):
                os.remove(miss_path)
            return png_path
        with open(miss_path, "w") as f:
            f.write(f"{kind} {int(time.time())}")
        return None


def prefetch(brand_ids) -> int:
    """Descarga en segundo plano los logos que falten. Devuelve cuántos hay."""
    n = 0
    for bid in sorted(set(brand_ids)):
        if get_logo(bid):
            n += 1
    return n
