import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import "dotenv/config";
import { AccessToken } from "livekit-token-server";

/**
 * 환경변수 확인
 */
const required = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`❌ Missing env: ${k}`);
    process.exit(1);
  }
}

const app = express();
app.use(helmet());
app.use(cors());                // 필요 시 origin 화이트리스트로 제한
app.use(express.json());
app.use(morgan("tiny"));

/**
 * 간단한 헬스체크
 */
app.get("/health", (_req, res) => {
  res.json({ ok: true, url: process.env.LIVEKIT_URL });
});

/**
 * 토큰 발급 엔드포인트
 * POST /token
 * body:
 *  - room: 접속할 방 이름 (기본 "broadcast")
 *  - name: 참가자 표시명 (기본 "guest-<rand>")
 *  - role: "host" | "viewer" (기본 viewer)
 *  - metadata: 선택, 참가자 메타데이터(JSON.stringfy-able)
 *
 * 권한 정책:
 *  - host  : publish=true, subscribe=true (발신자)
 *  - viewer: publish=false, subscribe=true (시청자)
 */
app.post("/token", (req, res) => {
  const {
    room = "broadcast",
    name,
    role = "viewer",
    metadata
  } = req.body || {};

  const identity =
    (name && String(name).slice(0, 64)) ||
    `guest-${Math.random().toString(36).slice(2, 8)}`;

  const isHost = role === "host";

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity,
      // 토큰 만료 (초)
      ttl: Number(process.env.TOKEN_TTL || 3600)
    }
  );

  at.addGrant({
    room,
    roomJoin: true,
    canPublish: isHost,       // 발신자는 true
    canSubscribe: true,
    // 필요시 다음 권한도 추가 가능
    // canPublishData: true,
    // ingressAdmin: true,
    // roomAdmin: true
  });

  if (metadata !== undefined) {
    try {
      at.metadata = typeof metadata === "string" ? metadata : JSON.stringify(metadata);
    } catch {
      // metadata 직렬화 실패는 무시
    }
  }

  const token = at.toJwt();
  return res.json({
    url: process.env.LIVEKIT_URL,
    token,
    identity,
    role: isHost ? "host" : "viewer",
    room
  });
});

/**
 * (선택) 발신자/시청자용 숏컷
 * POST /token/host   -> role=host
 * POST /token/viewer -> role=viewer
 */
app.post("/token/host", (req, res) => {
  req.body = { ...(req.body || {}), role: "host" };
  app._router.handle(req, res, () => {}, "POST", "/token");
});
app.post("/token/viewer", (req, res) => {
  req.body = { ...(req.body || {}), role: "viewer" };
  app._router.handle(req, res, () => {}, "POST", "/token");
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`✅ Token server running on http://localhost:${port}`);
});
