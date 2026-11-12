import binascii
import importlib.util
from pathlib import Path
import struct
import unittest
import zlib


ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("integrity", ROOT / "scripts" / "production-integrity.py")
integrity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(integrity)


def chunks(data):
    offset = 8
    result = []
    while offset < len(data):
        size = struct.unpack(">I", data[offset:offset + 4])[0]
        result.append((data[offset + 4:offset + 8], data[offset + 8:offset + 8 + size]))
        offset += size + 12
    return result


def encode(items):
    return integrity.SIGNATURE + b"".join(
        struct.pack(">I", len(body)) + kind + body
        + struct.pack(">I", binascii.crc32(kind + body) & 0xFFFFFFFF)
        for kind, body in items
    )


class ProductionIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.name = "docs/install-browser-en.png"
        self.original = (ROOT / self.name).read_bytes()

    def rejected(self, name, original, changed):
        with self.assertRaises(ValueError):
            integrity.verify_asset(name, original, changed)

    def test_six_explicit_paths_allow_lossless_recompression(self):
        self.assertEqual(len(integrity.PNG_PATHS), 6)
        for name in sorted(integrity.PNG_PATHS):
            with self.subTest(name=name):
                original = (ROOT / name).read_bytes()
                items = chunks(original)
                compressed = zlib.compress(zlib.decompress(b"".join(body for kind, body in items if kind == b"IDAT")), 1)
                transformed = encode(
                    [(kind, body) for kind, body in items if kind not in {b"IDAT", b"IEND"}]
                    + [(b"IDAT", compressed[:100]), (b"IDAT", compressed[100:]), (b"IEND", b"")]
                )
                self.assertNotEqual(original, transformed)
                integrity.verify_asset(name, original, transformed)

    def test_demonstrated_exif_density_transport_metadata(self):
        width, height = integrity.decode_png(self.original)[:2]
        exif = (integrity.EXIF_PREFIX + struct.pack("<I", width)
                + bytes.fromhex("03a0040001000000") + struct.pack("<I", height) + b"\0" * 4)
        items = chunks(self.original)
        transformed = encode(items[:1] + [(b"eXIf", exif), (b"pHYs", bytes.fromhex("00000b1300000b1301"))] + items[1:])
        integrity.verify_asset(self.name, self.original, transformed)
        invalid = encode(items[:1] + [(b"eXIf", exif.replace(b"\xff\xff", b"\x01\x00"))] + items[1:])
        self.rejected(self.name, self.original, invalid)

    def test_pixel_and_alpha_changes(self):
        for name in [self.name, "icons/icon-180.png"]:
            original = (ROOT / name).read_bytes()
            items = chunks(original)
            raw = bytearray(zlib.decompress(b"".join(body for kind, body in items if kind == b"IDAT")))
            raw[4 if name.startswith("icons/") else 1] ^= 1
            changed = encode([(kind, body) for kind, body in items if kind not in {b"IDAT", b"IEND"}]
                             + [(b"IDAT", zlib.compress(raw)), (b"IEND", b"")])
            self.rejected(name, original, changed)

    def test_permitted_color_metadata_removal_and_changes(self):
        for name in ["icons/icon-180.png", "icons/header-watermark.png"]:
            original = (ROOT / name).read_bytes()
            items = chunks(original)
            for kind in integrity.COLOR_CHUNKS & {tag for tag, _ in items}:
                integrity.verify_asset(name, original, encode([(tag, body) for tag, body in items if tag != kind]))
            integrity.verify_asset(name, original, encode([(tag, body) for tag, body in items
                                                          if tag not in integrity.COLOR_CHUNKS]))
        items = chunks(self.original)
        integrity.verify_asset(self.name, self.original, encode(items[:1] + [(b"gAMA", struct.pack(">I", 100000))] + items[1:]))

    def test_dimensions_animation_metadata_and_formats(self):
        items = chunks(self.original)
        header = items[0][1]
        for changed_header in [
            struct.pack(">I", 621) + header[4:],
            struct.pack(">II", 50000, 50000) + header[8:],
            header[:8] + bytes([16]) + header[9:],
            header[:-1] + b"\x01",
        ]:
            self.rejected(self.name, self.original, encode([(b"IHDR", changed_header)] + items[1:]))
        for tag, body in [(b"acTL", b"\0" * 8), (b"tEXt", b"unexpected"), (b"pHYs", b"\0" * 9),
                          (b"eXIf", b"invalid"), (b"tRNS", b"\0" * 6)]:
            self.rejected(self.name, self.original, encode(items[:1] + [(tag, body)] + items[1:]))

    def test_corruption_and_resource_bounds(self):
        self.rejected(self.name, self.original, self.original[:-1])
        self.rejected(self.name, self.original, self.original + b"trailing")
        damaged = bytearray(self.original)
        damaged[40] ^= 1
        self.rejected(self.name, self.original, damaged)
        self.rejected(self.name, self.original, b"not a PNG")
        items = chunks(self.original)
        self.rejected(self.name, self.original, encode(items[:-1] + [(b"IHDR", items[0][1]), items[-1]]))
        with self.assertRaises(ValueError):
            integrity.inflate(zlib.compress(b"x" * 10000), 100)

    def test_no_exception_for_other_assets(self):
        transformed = encode(chunks(self.original)[:1] + [(b"pHYs", bytes.fromhex("00000b1300000b1301"))] + chunks(self.original)[1:])
        for name in ["icons/unapproved.png", "app.js", "styles.css", "locales/en.json", "manifest.webmanifest"]:
            self.rejected(name, self.original, transformed)
            self.assertEqual(integrity.verify_asset(name, self.original, self.original), "byte-exact")


if __name__ == "__main__":
    unittest.main()
