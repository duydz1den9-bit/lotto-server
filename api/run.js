import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const ADMIN_PASS = "cc123456";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, pass, days, key, uid, skey, issueId, betAmount } = req.body || {};

  if (action === 'create-key') {
    if (pass !== ADMIN_PASS) return res.json({ success: false, msg: "Sai mật khẩu Admin!" });
    const d = parseInt(days) || 1;
    const newKey = "VIP-" + Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + d + "D";
    const expireAt = Date.now() + d * 86400000;
    
    await redis.set(`key:${newKey}`, JSON.stringify({ expireAt, boundUid: null }));
    return res.json({ success: true, key: newKey, expireDate: new Date(expireAt).toLocaleString("vi-VN") });
  }

  if (action === 'list-keys') {
    if (pass !== ADMIN_PASS) return res.json({ success: false, msg: "Sai mật khẩu Admin!" });
    const keyNames = await redis.keys('key:*');
    const keys = [];
    for (const kName of keyNames) {
      const raw = await redis.get(kName);
      if (raw) {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        keys.push({
          key: kName.replace('key:', ''),
          expireDate: new Date(data.expireAt).toLocaleString("vi-VN"),
          isExpired: Date.now() > data.expireAt,
          boundUid: data.boundUid || "Chưa kích hoạt"
        });
      }
    }
    return res.json({ success: true, keys });
  }

  if (action === 'delete-key') {
    if (pass !== ADMIN_PASS) return res.json({ success: false, msg: "Sai mật khẩu Admin!" });
    await redis.del(`key:${key}`);
    return res.json({ success: true });
  }

  if (action === 'scan' || action === 'bet') {
    if (!key) return res.json({ success: false, msg: "Vui lòng nhập Key!" });
    const raw = await redis.get(`key:${key.trim()}`);
    if (!raw) return res.json({ success: false, msg: "Key không tồn tại hoặc đã bị khóa!" });

    const kData = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Date.now() > kData.expireAt) return res.json({ success: false, msg: "Key đã hết hạn!" });

    if (!kData.boundUid && uid) {
      kData.boundUid = uid;
      await redis.set(`key:${key.trim()}`, JSON.stringify(kData));
    } else if (kData.boundUid && uid && kData.boundUid !== uid) {
      return res.json({ success: false, msg: "Key đã khóa cho tài khoản khác!" });
    }

    const headers = {
      "Content-Type": "application/json",
      "Country-Code": "vn",
      "User-Id": String(uid),
      "User-Secret-Key": String(skey),
      "User-Login": "login_v2",
      "Xb-Language": "en-US"
    };

    if (action === "scan") {
      const r = await fetch(`https://winhash.net{Date.now()}`, { headers });
      return res.json({ success: true, data: await r.json() });
    }

    if (action === "bet") {
      const amt = String(betAmount);
      const r = await fetch("https://winhash.net", {
        method: "POST",
        headers,
        body: JSON.stringify({
          game_id: 1,
          issue_id: issueId,
          items: [{ id: 70309, amount: amt, asset: "BUILD" }, { id: 71218, amount: amt, asset: "BUILD" }]
        })
      });
      return res.json({ success: true, data: await r.json() });
    }
  }

  return res.status(400).json({ success: false, msg: "Yêu cầu không hợp lệ" });
}
