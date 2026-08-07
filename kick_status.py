#!/usr/bin/env python3
"""Fetch Kick live status with curl_cffi or urllib fallback."""
import json, sys

def check_kick():
    # Attempt 1: curl_cffi
    try:
        from curl_cffi import requests
        r = requests.get(
            "https://kick.com/api/v2/channels/bigdgamestv",
            impersonate="chrome",
            timeout=10,
        )
        if r.status_code == 200:
            data = r.json()
            livestream = data.get("livestream")
            live = bool(livestream and livestream.get("is_live") is not False)
            return {"live": live, "ok": True}
    except Exception:
        pass

    # Attempt 2: urllib.request
    try:
        import urllib.request, ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(
            "https://kick.com/api/v2/channels/bigdgamestv",
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json"
            }
        )
        with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                livestream = data.get("livestream")
                live = bool(livestream and livestream.get("is_live") is not False)
                return {"live": live, "ok": True}
    except Exception as e:
        return {"live": False, "ok": False, "error": str(e)}


    return {"live": False, "ok": False}

if __name__ == "__main__":
    json.dump(check_kick(), sys.stdout)

