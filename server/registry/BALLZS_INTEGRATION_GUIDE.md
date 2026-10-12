# BALLZS Website Integration Guide
## Shared Milestone Draw Registry (BIGDTV + BALLZS)

This document provides everything needed for the **BALLZS** team to integrate their **Next.js (React / TypeScript / Neon PostgreSQL)** application with the shared Community Milestone Draw Registry.

---

### 1. Overview & Architecture

Both **BALLZS** and **BIGDTV** connect to the same central draw registry so players wagering under either affiliate code can participate in the shared community milestones ($50k, $100k, $150k targets with $3k, $5k, $10k personal monthly wager requirements).

- **Zero Duplicate Entries**: Enforced atomically via database unique constraints (`UNIQUE(draw_id, player_id)` and `UNIQUE(draw_id, yeet_user_id)`). If a player joins on BALLZS and later tries on BIGDTV (or vice-versa), they receive `200 OK` with `alreadyRegistered: true` and `registeredVia: "ballzs"`.
- **Inter-Site Security**: Calls are authenticated using **HMAC-SHA256** signatures using your site key and secret.
- **Combined Wagers**: Wager eligibility checks the player's volume across both affiliate codes.

---

### 2. Environment Variables

Add the following to your BALLZS Next.js `.env` or `.env.local`:

```env
# Shared Draw Registry API Base URL
DRAW_REGISTRY_BASE_URL="https://bigdtv.vip"

# BALLZS Site Credentials
REGISTRY_BALLZS_KEY_ID="key_ballzs_live_01"
REGISTRY_BALLZS_SECRET="ballzs_partner_secret_change_me"
```

---

### 3. Drop-In TypeScript Client SDK

Place this file in your project under `lib/drawRegistryClient.ts`:

```typescript
import crypto from "crypto";

export interface PoolStatusResponse {
  campaignMonth: string;
  userWager: number;
  pools: Array<{
    milestoneId: number;
    threshold: number;
    target: number;
    totalEntries: number;
    status: string;
    userJoined: boolean;
    userEligible: boolean;
    registeredVia?: string | null;
  }>;
}

export interface RegisterResult {
  success: boolean;
  alreadyRegistered?: boolean;
  milestoneId?: number;
  poolSize?: number;
  registeredVia?: string;
  yeetUsername?: string;
  message?: string;
  error?: string;
  currentWager?: number;
  threshold?: number;
  remaining?: number;
}

export class DrawRegistryClient {
  private baseUrl: string;
  private keyId: string;
  private secret: string;

  constructor() {
    this.baseUrl = (process.env.DRAW_REGISTRY_BASE_URL || "https://bigdtv.vip").replace(/\/$/, "");
    this.keyId = process.env.REGISTRY_BALLZS_KEY_ID || "key_ballzs_live_01";
    this.secret = process.env.REGISTRY_BALLZS_SECRET || "ballzs_partner_secret_change_me";
  }

  private sign(body: any) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const rawBody = typeof body === "string" ? body : JSON.stringify(body || {});
    const payload = `${timestamp}.${rawBody}`;
    const signature = crypto.createHmac("sha256", this.secret).update(payload).digest("hex");

    return {
      "Content-Type": "application/json",
      "x-site-key-id": this.keyId,
      "x-site-signature": signature,
      "x-site-timestamp": timestamp
    };
  }

  /**
   * Get live pool counts and player eligibility
   */
  async getPoolStatus(discordId?: string, yeetUsername?: string): Promise<PoolStatusResponse> {
    const search = new URLSearchParams();
    if (discordId) search.append("discordId", discordId);
    if (yeetUsername) search.append("yeetUsername", yeetUsername);

    const res = await fetch(`${this.baseUrl}/api/v1/draws/pool-status?${search.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (!res.ok) throw new Error(`Pool status error: ${res.statusText}`);
    return await res.json();
  }

  /**
   * Register player into a Milestone Draw pool
   */
  async registerForDraw(params: {
    discordId: string;
    milestoneId: number;
    idempotencyKey?: string;
    candidateWager?: number;
    candidateYeetUsername?: string;
    candidateYeetUserId?: number;
  }): Promise<RegisterResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/draws/register`, {
      method: "POST",
      headers: this.sign(params),
      body: JSON.stringify(params)
    });
    return await res.json();
  }

  /**
   * Link Discord and verified Yeet username
   */
  async linkPlayer(params: {
    discordId: string;
    discordUsername?: string;
    yeetUserId?: number;
    yeetUsername: string;
  }) {
    const res = await fetch(`${this.baseUrl}/api/v1/players/link`, {
      method: "POST",
      headers: this.sign(params),
      body: JSON.stringify(params)
    });
    return await res.json();
  }
}

export const drawRegistry = new DrawRegistryClient();
```

---

### 4. Next.js App Router Route Handlers (Examples)

#### `app/api/draws/status/route.ts`
```typescript
import { NextResponse } from "next/server";
import { drawRegistry } from "@/lib/drawRegistryClient";
import { getServerSession } from "next-auth"; // or your auth session

export async function GET(req: Request) {
  const session = await getServerSession();
  const discordId = session?.user?.discordId;
  const yeetUsername = session?.user?.yeetUsername;

  try {
    const data = await drawRegistry.getPoolStatus(discordId, yeetUsername);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

#### `app/api/draws/join/route.ts`
```typescript
import { NextResponse } from "next/server";
import { drawRegistry } from "@/lib/drawRegistryClient";
import { getServerSession } from "next-auth";

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.discordId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { milestoneId } = await req.json();

  try {
    const result = await drawRegistry.registerForDraw({
      discordId: session.user.discordId,
      milestoneId: Number(milestoneId),
      candidateYeetUsername: session.user.yeetUsername,
      candidateYeetUserId: session.user.yeetUserId
    });

    if (!result.success && result.error) {
      return NextResponse.json(result, { status: 403 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

---

### 5. API Response Specifications

#### Pool Status (`GET /api/v1/draws/pool-status`)
```json
{
  "campaignMonth": "2026-10",
  "userWager": 4520.50,
  "pools": [
    {
      "milestoneId": 1,
      "threshold": 3000,
      "target": 50000,
      "totalEntries": 14,
      "status": "open",
      "userJoined": true,
      "userEligible": true,
      "registeredVia": "ballzs"
    },
    {
      "milestoneId": 2,
      "threshold": 5000,
      "target": 100000,
      "totalEntries": 8,
      "status": "open",
      "userJoined": false,
      "userEligible": false,
      "registeredVia": null
    }
  ]
}
```

#### Registration Success (`POST /api/v1/draws/register`)
- **Newly entered (HTTP 201)**:
  ```json
  {
    "success": true,
    "alreadyRegistered": false,
    "milestoneId": 1,
    "poolSize": 15,
    "registeredVia": "ballzs",
    "yeetUsername": "PinkMynx222",
    "message": "You're in the draw! 15 players in the pool."
  }
  ```
- **Already joined previously on either site (HTTP 200)**:
  ```json
  {
    "success": true,
    "alreadyRegistered": true,
    "registeredVia": "bigdtv",
    "enteredAt": "2026-10-08T14:22:00.000Z",
    "message": "Already registered for Milestone 1 via bigdtv!"
  }
  ```
- **Ineligible / Insufficient wager (HTTP 403)**:
  ```json
  {
    "success": false,
    "code": "WAGER_TOO_LOW",
    "error": "Monthly wager ($1,250.00) is below the $3,000 requirement.",
    "currentWager": 1250,
    "threshold": 3000,
    "remaining": 1750
  }
  ```
