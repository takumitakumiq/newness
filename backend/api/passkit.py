import base64
import hashlib
import io
import json
import os
import tempfile
import zipfile
import subprocess
from typing import Dict

from .models import Ticket


def build_pass_payload(ticket: Ticket) -> Dict:
    team_id = os.environ.get("PASSKIT_TEAM_ID", "")
    pass_type_id = os.environ.get("PASSKIT_PASS_TYPE_ID", "")
    org_name = os.environ.get("PASSKIT_ORG_NAME", "MATSU")
    return {
        "formatVersion": 1,
        "passTypeIdentifier": pass_type_id,
        "serialNumber": str(ticket.id),
        "teamIdentifier": team_id,
        "organizationName": org_name,
        "description": "MATSU チケット",
        "barcode": {
            "format": "PKBarcodeFormatQR",
            "message": str(ticket.id),
            "messageEncoding": "iso-8859-1",
        },
        "eventTicket": {
            "primaryFields": [
                {
                    "key": "event",
                    "label": "文化祭",
                    "value": "MATSU",
                }
            ],
            "secondaryFields": [
                {
                    "key": "date",
                    "label": "日付",
                    "value": ticket.slot.event_date.isoformat() if ticket.slot else "",
                },
                {
                    "key": "time",
                    "label": "時間",
                    "value": ticket.slot.start_time.strftime('%H:%M') if ticket.slot else "",
                },
                {
                    "key": "type",
                    "label": "種別",
                    "value": ticket.attribute.display_name if ticket.attribute else "",
                },
            ],
        },
        "backgroundColor": "rgb(17, 24, 39)",
        "foregroundColor": "rgb(255, 255, 255)",
        "labelColor": "rgb(148, 163, 184)",
    }


def build_pkpass(pass_data: Dict) -> bytes:
    cert_path = os.environ.get("PASSKIT_CERT_PATH")
    key_path = os.environ.get("PASSKIT_KEY_PATH")
    wwdr_path = os.environ.get("PASSKIT_WWDR_CERT_PATH")
    key_password = os.environ.get("PASSKIT_KEY_PASSWORD", "")

    tiny_png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQImWNgYGD4DwABBAEAu2Q9vwAAAABJRU5ErkJggg=="
    )

    files = {
        "pass.json": json.dumps(pass_data, ensure_ascii=False).encode("utf-8"),
        "icon.png": tiny_png,
        "logo.png": tiny_png,
    }

    manifest = {name: hashlib.sha1(content).hexdigest() for name, content in files.items()}
    manifest_bytes = json.dumps(manifest, ensure_ascii=False).encode("utf-8")

    with tempfile.TemporaryDirectory() as tmpdir:
        manifest_path = os.path.join(tmpdir, "manifest.json")
        signature_path = os.path.join(tmpdir, "signature")
        with open(manifest_path, "wb") as f:
            f.write(manifest_bytes)

        cmd = [
            "openssl", "smime", "-binary", "-sign",
            "-certfile", wwdr_path,
            "-signer", cert_path,
            "-inkey", key_path,
            "-in", manifest_path,
            "-out", signature_path,
            "-outform", "DER",
        ]
        if key_password:
            cmd.extend(["-passin", f"pass:{key_password}"])

        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError("opensslで署名に失敗しました")

        with open(signature_path, "rb") as f:
            signature_bytes = f.read()

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)
        zf.writestr("manifest.json", manifest_bytes)
        zf.writestr("signature", signature_bytes)

    return buffer.getvalue()
