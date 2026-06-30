console.log("RUNNING NEW SERVER.JS");
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.DEGEN_API_KEY;
const KICK_CHANNEL = "bigdgamestv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/kick-live", async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch(
            `https://kick.com/api/v2/channels/${KICK_CHANNEL}`,
            {
                headers: {
                    "Accept": "application/json",
                    "User-Agent": "BigDGamesTV-live-status/1.0"
                },
                signal: controller.signal
            }
        );

        if (!response.ok) {
            throw new Error(`Kick status request failed (${response.status})`);
        }

        const data = await response.json();
        const stream = data?.livestream;
        const live = Boolean(stream && stream.is_live !== false);

        res.set("Cache-Control", "no-store");
        res.json({
            channel: "BigDgamesTV",
            live,
            checkedAt: new Date().toISOString()
        });

    } catch (err) {
        console.error("Kick live status error:", err.message);

        res.set("Cache-Control", "no-store");
        res.json({
            channel: "BigDgamesTV",
            live: false,
            checkedAt: new Date().toISOString()
        });

    } finally {
        clearTimeout(timeout);
    }
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
