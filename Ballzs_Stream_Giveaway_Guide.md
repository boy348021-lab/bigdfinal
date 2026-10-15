# 🎰 Ballzs Stream Giveaway & Milestone Draw Guide
**Partner Streamer:** Ballzs  
**Campaign:** BigDTV × Ballzs Community Milestone Race  
**Target Milestone:** $100,000 Milestone #2 (5 × $20 Bonus Buys • $100 Total)  
**Security Level:** Read-Only Scoped Partner Access  

---

## 📌 Overview
This document provides Ballzs with the required keys, direct links, and step-by-step instructions to securely fetch the verified entrant list from the website to run the **$100K Community Milestone Giveaway** live on stream.

---

## 🔑 Your Dedicated Partner Access Key
For security, this dedicated token grants read-only access strictly to the milestone giveaway pool without exposing root administrative controls.

| Parameter | Value |
| :--- | :--- |
| **Partner Identifier** | `ballzs` |
| **Draw Secret Key** | `ballzs-stream-draw-access-2026` |
| **Header Name** | `x-draw-secret` (or query param `draw_secret`) |

---

## 🌐 Quick Web Link (One-Click Access)

Open this link in any browser before or during the stream to view the real-time list of qualified participants:

```text
https://bigd.tv/api/milestones/pool-entries?milestoneId=2&draw_secret=ballzs-stream-draw-access-2026
```
*(Note: If testing locally or via an alternative staging domain, replace `bigd.tv` with your active domain or IP).*

---

## 📋 Qualified Participants in the $100K Pool
All entrants have verified their Yeet accounts under affiliate code **`BIGDTV`** or **`BALLZS`** and satisfied the **$5,000+** personal monthly wager requirement:

| Rank | Yeet Username | Entry Wager | Status |
| :---: | :--- | :---: | :---: |
| 1 | `why****` | $9,188.70 | ✅ Verified Qualified |
| 2 | `ems1` | $7,322.10 | ✅ Verified Qualified |
| 3 | `bettyeddy` | $7,065.63 | ✅ Verified Qualified |
| 4 | `bluntz` | $5,067.89 | ✅ Verified Qualified |

---

## 🎡 Step-by-Step Instructions to Run the Draw Live on Stream

### Step 1: Open Your Giveaway Wheel
Open your preferred live drawing tool in your streaming browser source:
- **[Wheel of Names](https://wheelofnames.com/)**
- **Streamlabs / StreamElements Giveaway Tool**
- **Pick-a-Winner Tool**

### Step 2: Paste the Entrant List
Copy and paste the clean list of qualified names directly into the wheel:
```text
why****
ems1
bettyeddy
bluntz
```

*(Any late qualifiers who cross the $5,000 threshold and register before the live stream will automatically appear in real-time when refreshing the URL).*

### Step 3: Spin for the 5 Winners
- Milestone 2 Reward: **5 × $20 Bonus Buys** ($100 USD Total Prize Pool).
- Spin the wheel 5 times (or toggle *"Remove winner after draw"*).
- Announce the winners live on stream.

---

## 💻 Developer / Stream Bot Integration (Optional)

If your stream bot or custom overlay fetches entrants automatically via code:

### cURL
```bash
curl -X GET "https://bigd.tv/api/milestones/pool-entries?milestoneId=2" \
     -H "x-draw-secret: ballzs-stream-draw-access-2026"
```

### JSON Response Format
```json
{
  "success": true,
  "milestoneId": 2,
  "campaignMonth": "2026-10",
  "totalEntries": 4,
  "wheelReadyList": [
    "why****",
    "ems1",
    "bettyeddy",
    "bluntz"
  ],
  "entries": [
    {
      "id": "e5606d97-f91e-4e14-ac66-ac65730c6696",
      "yeet_username": "why****",
      "wager_at_entry": 9188.7,
      "entered_at": "2026-10-12T12:03:34.711Z"
    }
  ]
}
```

---

## 🔒 Security Best Practices
- **Never display the URL containing the secret key directly on screen.** Copy the usernames before transitioning your stream scene or use the wheel directly.
- The `ballzs-stream-draw-access-2026` key is read-only and restricted to giveaway pool lists.
- For technical support or assistance during the stream, contact **BigD** or **Degen_x**.
