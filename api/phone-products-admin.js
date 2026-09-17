import { timingSafeEqual } from "node:crypto";

const REPOSITORY = "seohum/KT_DongBu";
const CATALOG_PATH = "phone-products.json";
const ALLOWED_ORIGINS = new Set([
  "https://www.ktmns.store",
  "https://ktmns.store",
  "https://seohum.github.io"
]);

function clean(value, maxLength) {
  return String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maxLength);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function cors(response, origin) {
  response.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS.has(origin) ? origin : "https://www.ktmns.store");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
  response.setHeader("Cache-Control", "no-store");
}

function normalizeProducts(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) throw new Error("상품 목록을 확인해주세요.");
  const seen = new Set();
  return input.map((item, index) => {
    const name = clean(item && item.name, 80);
    const colors = Array.isArray(item && item.colors) ? item.colors.map(value => clean(value, 40)).filter(Boolean).slice(0, 30) : [];
    const capacities = Array.isArray(item && item.capacities) ? item.capacities.map(value => clean(value, 30)).filter(Boolean).slice(0, 30) : [];
    if (!name || !colors.length || !capacities.length) throw new Error((index + 1) + "번째 모델의 이름·색상·용량을 확인해주세요.");
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error("같은 모델명이 중복되어 있습니다: " + name);
    seen.add(key);
    return { name, colors: [...new Set(colors)], capacities: [...new Set(capacities)], active: item.active !== false };
  });
}

async function githubRequest(path, options = {}) {
  const token = process.env.PHONE_GITHUB_TOKEN;
  const response = await fetch("https://api.github.com" + path, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "KT-DongBu-phone-product-admin",
      ...(options.headers || {})
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.message || "GitHub 저장에 실패했습니다.");
    error.status = response.status;
    throw error;
  }
  return result;
}

export default async function handler(request, response) {
  const origin = String(request.headers.origin || "");
  cors(response, origin);
  if (request.method === "OPTIONS") return response.status(ALLOWED_ORIGINS.has(origin) ? 204 : 403).end();
  if (request.method !== "POST") return response.status(405).json({ success: false, message: "지원하지 않는 요청입니다." });
  if (!ALLOWED_ORIGINS.has(origin)) return response.status(403).json({ success: false, message: "허용되지 않은 요청입니다." });
  if (!process.env.PHONE_ADMIN_PASSWORD || !process.env.PHONE_GITHUB_TOKEN) {
    return response.status(503).json({ success: false, message: "관리자 저장 설정이 아직 완료되지 않았습니다." });
  }
  if (!safeEqual(request.body && request.body.password, process.env.PHONE_ADMIN_PASSWORD)) {
    return response.status(401).json({ success: false, message: "관리자 비밀번호가 올바르지 않습니다." });
  }

  try {
    const products = normalizeProducts(request.body && request.body.products);
    const current = await githubRequest("/repos/" + REPOSITORY + "/contents/" + CATALOG_PATH + "?ref=main");
    const catalog = JSON.stringify(products, null, 2) + "\n";
    const saved = await githubRequest("/repos/" + REPOSITORY + "/contents/" + CATALOG_PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Update phone preorder product catalog",
        content: Buffer.from(catalog, "utf8").toString("base64"),
        sha: current.sha,
        branch: "main"
      })
    });
    return response.status(200).json({ success: true, commitSha: saved.commit && saved.commit.sha });
  } catch (error) {
    console.error("phone product admin save failed", error && error.message);
    if (error && error.status === 409) return response.status(409).json({ success: false, message: "다른 변경사항이 먼저 저장됐습니다. 새로고침 후 다시 시도해주세요." });
    return response.status(400).json({ success: false, message: error && error.message || "모델 목록 저장에 실패했습니다." });
  }
}
