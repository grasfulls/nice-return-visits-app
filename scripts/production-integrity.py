"""Verify deployed release assets without relaxing executable byte integrity."""
import binascii
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import urllib.request
import zlib


ROOT = Path(__file__).resolve().parent.parent
PNG_PATHS = {
    "docs/install-browser-en.png",
    "docs/install-browser-es.png",
    "icons/icon-180.png",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/header-watermark.png",
}
SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 2_000_000
COLOR_CHUNKS = {b"sRGB", b"gAMA", b"cHRM", b"iCCP"}
EXIF_PREFIX = bytes.fromhex(
    "49492a000800000006001201030001000000010000001a0105000100000056000000"
    "1b010500010000005e00000028010300010000000200000013020300010000000100"
    "00006987040001000000660000000000000048000000010000004800000001000000"
    "060000900700040000003032313001910700040000000102030000a0070004000000"
    "3031303001a0030001000000ffff000002a0040001000000"
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def inflate(data, maximum):
    decoder = zlib.decompressobj()
    result = decoder.decompress(data, maximum + 1)
    require(len(result) <= maximum and not decoder.unconsumed_tail,
            "PNG decompression bound exceeded")
    require(decoder.eof and not decoder.unused_data, "Invalid compressed PNG stream")
    return result


def paeth(a, b, c):
    prediction = a + b - c
    distances = [abs(prediction - value) for value in (a, b, c)]
    return (a, b, c)[distances.index(min(distances))]


def decode_png(data):
    data = bytes(data)
    require(len(data) <= MAX_BYTES and data.startswith(SIGNATURE), "Invalid PNG signature/size")
    chunks = []
    offset = 8
    while offset < len(data):
        require(offset + 12 <= len(data), "Truncated PNG chunk")
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        require(length <= MAX_BYTES and offset + length + 12 <= len(data), "Invalid PNG chunk length")
        kind = data[offset + 4:offset + 8]
        body = data[offset + 8:offset + 8 + length]
        crc = struct.unpack(">I", data[offset + 8 + length:offset + 12 + length])[0]
        require(binascii.crc32(kind + body) & 0xFFFFFFFF == crc, "PNG checksum mismatch")
        require(kind in {b"IHDR", b"IDAT", b"IEND", b"pHYs", b"eXIf"} | COLOR_CHUNKS,
                "Unsupported PNG chunk, metadata, or animation")
        chunks.append((kind, body))
        require(len(chunks) <= 1024, "Too many PNG chunks")
        offset += length + 12
    kinds = [kind for kind, _ in chunks]
    require(kinds and kinds[0] == b"IHDR" and kinds[-1] == b"IEND", "Invalid PNG framing")
    require(kinds.count(b"IHDR") == kinds.count(b"IEND") == 1, "Duplicate PNG framing")
    require(len(chunks[0][1]) == 13 and chunks[-1][1] == b"", "Invalid PNG header/end")
    for kind in set(kinds) - {b"IDAT"}:
        require(kinds.count(kind) == 1, "Duplicate PNG metadata")
    require(b"IDAT" in kinds, "PNG image data missing")
    first, last = kinds.index(b"IDAT"), len(kinds) - 1 - kinds[::-1].index(b"IDAT")
    require(all(kind == b"IDAT" for kind in kinds[first:last + 1]), "Noncontiguous PNG image data")
    require(last == len(kinds) - 2, "Unsupported metadata ordering")
    width, height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", chunks[0][1])
    require(width > 0 and height > 0 and width * height <= MAX_PIXELS, "PNG dimension bound exceeded")
    require(depth == 8 and color in (2, 6) and (compression, filtering, interlace) == (0, 0, 0),
            "Unsupported PNG format")
    metadata = dict((kind, body) for kind, body in chunks if kind not in {b"IHDR", b"IDAT", b"IEND"})
    colors = {}
    for kind in COLOR_CHUNKS & metadata.keys():
        body = metadata[kind]
        if kind == b"iCCP":
            name, separator, profile = body.partition(b"\0")
            require(separator and 1 <= len(name) <= 79 and profile[:1] == b"\0", "Invalid ICC metadata")
            colors[kind] = inflate(profile[1:], 1024 * 1024)
        else:
            require(len(body) == {b"sRGB": 1, b"gAMA": 4, b"cHRM": 32}[kind], "Invalid color metadata")
            colors[kind] = body
    channels = 3 if color == 2 else 4
    stride = width * channels
    raw = inflate(b"".join(body for kind, body in chunks if kind == b"IDAT"), (stride + 1) * height)
    require(len(raw) == (stride + 1) * height, "Invalid PNG raster size")
    previous = bytearray(stride)
    rgba = bytearray()
    for row_index in range(height):
        start = row_index * (stride + 1)
        mode = raw[start]
        require(mode <= 4, "Unsupported PNG row filter")
        row = bytearray(raw[start + 1:start + 1 + stride])
        for i in range(stride):
            left = row[i - channels] if i >= channels else 0
            above = previous[i]
            corner = previous[i - channels] if i >= channels else 0
            adjustment = (0, left, above, (left + above) // 2, paeth(left, above, corner))[mode]
            row[i] = (row[i] + adjustment) & 255
        if channels == 4:
            rgba.extend(row)
        else:
            for i in range(0, stride, 3):
                rgba.extend(row[i:i + 3])
                rgba.append(255)
        previous = row
    return width, height, hashlib.sha256(rgba).digest(), colors, metadata


def verify_asset(name, expected, actual):
    if name not in PNG_PATHS:
        require(expected == actual, "Byte-exact asset mismatch: " + name)
        return "byte-exact"
    reference = decode_png(expected)
    delivered = decode_png(actual)
    require(reference[:2] == delivered[:2], "PNG dimensions changed: " + name)
    require(reference[2] == delivered[2], "PNG pixels/transparency changed: " + name)
    for kind, body in delivered[4].items():
        if kind in COLOR_CHUNKS:
            continue
        if reference[4].get(kind) == body:
            continue
        if kind == b"pHYs" and body == bytes.fromhex("00000b1300000b1301"):
            continue
        if kind == b"eXIf":
            approved = (EXIF_PREFIX + struct.pack("<I", delivered[0])
                        + bytes.fromhex("03a0040001000000") + struct.pack("<I", delivered[1]) + b"\0" * 4)
            require(body == approved, "Unapproved PNG EXIF metadata: " + name)
            continue
        raise ValueError("Unapproved PNG metadata change: " + name)
    for kind in reference[4].keys() - delivered[4].keys() - COLOR_CHUNKS:
        require(kind == b"pHYs", "Required PNG metadata missing: " + name)
    return "PNG dimensions, decoded RGBA, alpha and bounded structure"


def production_check():
    metadata = json.loads((ROOT / "version.json").read_text())
    worker = (ROOT / "service-worker.js").read_text()
    import re
    paths = json.loads(re.sub(r",\s*]", "]", re.search(r"const APP_SHELL = (\[[\s\S]*?\]);", worker)[1]))
    failures = []
    for asset in paths + ["./version.json", "./release-history.json"]:
        from urllib.parse import urljoin, urlsplit, parse_qsl, urlencode, urlunsplit
        url = urlsplit(urljoin("https://nicereturnvisits.org/app/", asset))
        query = dict(parse_qsl(url.query))
        query["nrv-release"] = metadata["version"]
        address = urlunsplit(url._replace(query=urlencode(query)))
        name = url.path.removeprefix("/app/") or "index.html"
        expected = subprocess.check_output(["git", "show", "HEAD:" + name], cwd=ROOT)
        try:
            request = urllib.request.Request(address, headers={"Cache-Control": "no-cache"})
            with urllib.request.urlopen(request, timeout=20) as response:
                require(response.status == 200 and response.url == address, "Unexpected HTTP response/redirect")
                actual = response.read(MAX_BYTES + 1)
            result = verify_asset(name, expected, actual)
            print("PASS", name, result)
        except (ValueError, OSError) as error:
            failures.append(name)
            print("FAIL", name, str(error))
    require(not failures, "Production integrity blocked: " + ", ".join(failures))
    print("PASS all required production release assets")


if __name__ == "__main__":
    try:
        production_check()
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
