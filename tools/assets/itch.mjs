// Downloads free itch.io uploads without a login, the way the download page does, and caches them.
import { createWriteStream, existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** A minimal cookie jar: itch.io ties the csrf token to its session cookie. */
class Session {
  cookies = new Map();

  async fetch(url, init = {}) {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const response = await fetch(url, { ...init, headers: { ...init.headers, cookie, "user-agent": "crownfall-assets" } });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      this.cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return response;
  }

  /** POSTs the page's csrf token, as the download buttons do, and returns the JSON answer. */
  async post(url, token) {
    const body = new URLSearchParams({ csrf_token: token });
    const response = await this.fetch(url, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
    const json = await response.json();
    if (json.errors) throw new Error(`${url}: ${json.errors.join(", ")}`);
    return json;
  }
}

function csrfOf(html) {
  const match = html.match(/name="csrf_token" value="([^"]+)"/);
  if (!match) throw new Error("No csrf_token on the itch.io page");
  return match[1];
}

/**
 * Returns the cached path of the upload named `file` on the free itch.io page `creator.itch.io/slug`, downloading it
 * first when missing. itch.io does not version uploads: delete the cached file to take an update.
 */
export async function itchUpload(cache, creator, slug, file) {
  const dir = join(cache, "itch", slug);
  const target = join(dir, file);
  if (existsSync(target)) return target;
  mkdirSync(dir, { recursive: true });
  const base = `https://${creator}.itch.io/${slug}`;
  const session = new Session();
  const purchase = await (await session.fetch(`${base}/purchase`)).text();
  const { url: page } = await session.post(`${base}/download_url`, csrfOf(purchase));
  const html = await (await session.fetch(page)).text();
  const uploads = [...html.matchAll(/data-upload_id="(\d+)"[\s\S]*?<strong[^>]*class="name"[^>]*>([^<]+)</g)].map(([, id, name]) => ({ id, name: name.trim() }));
  const upload = uploads.find((u) => u.name === file);
  if (!upload) throw new Error(`${slug} has no upload ${file}: ${uploads.map((u) => u.name).join(", ")}`);
  const { url } = await session.post(`${base}/file/${upload.id}?source=game_download`, csrfOf(html));
  console.log(`downloading ${file}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${file} answered ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(`${target}.part`));
  renameSync(`${target}.part`, target);
  return target;
}
