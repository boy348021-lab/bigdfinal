console.log("RUNNING NEW SERVER.JS");
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

// Use env var with hardcoded fallback — ensures production works even if
// DEGEN_API_KEY is not yet set in Vercel's Environment Variables dashboard.
const API_KEY = process.env.DEGEN_API_KEY || "e7d0fb2a-20fd-471e-b6a2-f2989ea7ecba";
const KICK_CHANNEL = "bigdgamestv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

/* ──────────────────────────────────────────
   KICK LIVE STATUS — uses Python curl_cffi
   to bypass Cloudflare (Node fetch gets 403)
   ────────────────────────────────────────── */
let kickCache = { live: false, checkedAt: null };
const KICK_CACHE_TTL = 45_000; // 45 seconds

function fetchKickViaPython() {
    return new Promise((resolve) => {
        const script = path.join(__dirname, "kick_status.py");
        execFile("python3", [script], { timeout: 12_000 }, (err, stdout) => {
            if (err) {
                console.error("Kick Python helper error:", err.message);
                return resolve({ live: false, ok: false });
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                console.error("Kick Python helper bad JSON:", stdout?.slice(0, 200));
                resolve({ live: false, ok: false });
            }
        });
    });
}

app.get("/api/kick-live", async (req, res) => {
    // Return cached result if fresh
    if (kickCache.checkedAt && Date.now() - kickCache.checkedAt < KICK_CACHE_TTL) {
        res.set("Cache-Control", "no-store");
        return res.json({
            channel: "BigDgamesTV",
            live: kickCache.live,
            checkedAt: new Date(kickCache.checkedAt).toISOString()
        });
    }

    const result = await fetchKickViaPython();
    kickCache = { live: result.live, checkedAt: Date.now() };

    res.set("Cache-Control", "no-store");
    res.json({
        channel: "BigDgamesTV",
        live: result.live,
        checkedAt: new Date().toISOString()
    });
});

app.get("/api/leaderboard", async (req, res) => {
    try {
        let url =
            "https://api.degencity.com/api/v1/partner/affiliates/leaderboard";

        const params = new URLSearchParams();

        if (req.query.after)
            params.append("after", req.query.after);

        if (req.query.before)
            params.append("before", req.query.before);

        if (params.toString()) {
            url += "?" + params.toString();
        }

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "x-api-key": API_KEY,
                "Accept": "application/json"
            }
        });

        const data = await response.json();

        res.set("Cache-Control", "no-store");
        res.status(response.status).json(data);

    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log("================================");
    console.log(" BigDTV Server Running");
    console.log("================================");
    console.log(`http://localhost:${PORT}`);
});
