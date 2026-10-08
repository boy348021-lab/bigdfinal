#!/usr/bin/env python3
"""Fetch Kick live status with curl_cffi or urllib fallback."""
import json, sys

def check_kick():
    import os
    override_env = os.environ.get("KICK_OVERRIDE_LIVE")
    force_live = override_env in ("true", "1")

    channel_name = os.environ.get("KICK_CHANNEL", "bigdgamestv")

    # Helper to parse channel payload
    def parse_kick_data(data):
        livestream = data.get("livestream")
        is_live = bool(livestream is not None and livestream.get("is_live") is not False)
        if force_live:
            is_live = True

        user = data.get("user") or {}
        categories = data.get("recent_categories") or []
        recent_cat = categories[0] if categories else {}

        stream_info = None
        if livestream:
            stream_info = {
                "session_title": livestream.get("session_title") or "Live Stream",
                "viewer_count": livestream.get("viewer_count") or 0,
                "category": livestream.get("categories", [{}])[0].get("name") if livestream.get("categories") else recent_cat.get("name", "Slots & Casino"),
                "thumbnail": livestream.get("thumbnail", {}).get("url") if isinstance(livestream.get("thumbnail"), dict) else None,
                "created_at": livestream.get("created_at")
            }

        banner_obj = data.get("banner_image") or {}
        banner_url = banner_obj.get("url") if isinstance(banner_obj, dict) else None

        return {
            "live": is_live,
            "ok": True,
            "channel": channel_name,
            "username": user.get("username") or "BigDgamesTV",
            "bio": user.get("bio") or "Turning Dreams into reality",
            "profile_pic": user.get("profile_pic"),
            "banner_image": banner_url,
            "followers_count": data.get("followers_count") or 1328,
            "category": recent_cat.get("name") or "Slots & Casino",
            "category_icon": recent_cat.get("category", {}).get("icon") or "🎰",
            "playback_url": data.get("playback_url"),
            "stream": stream_info
        }

    # Attempt 1: curl_cffi if installed
    try:
        from curl_cffi import requests
        r = requests.get(
            f"https://kick.com/api/v2/channels/{channel_name}",
            impersonate="chrome",
            timeout=10,
        )
        if r.status_code == 200:
            return parse_kick_data(r.json())
    except Exception:
        pass

    # Attempt 2: urllib.request with modern headers
    try:
        import urllib.request, ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(
            f"https://kick.com/api/v2/channels/{channel_name}",
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json"
            }
        )
        with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                return parse_kick_data(data)
    except Exception as e:
        return {
            "live": force_live,
            "ok": False,
            "error": str(e),
            "channel": channel_name,
            "username": "BigDgamesTV",
            "bio": "Turning Dreams into reality",
            "profile_pic": "https://files.kick.com/images/user/51172020/profile_image/conversion/e7e16f19-c72d-4fe3-a289-76d7f58a1873-fullsize.webp",
            "followers_count": 1328,
            "category": "Slots & Casino"
        }

    return {"live": force_live, "ok": False, "channel": channel_name}

if __name__ == "__main__":
    json.dump(check_kick(), sys.stdout)

