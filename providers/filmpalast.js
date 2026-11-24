// FilmPalast provider for DebridUI
// Adapted from InvalidPandaa/nuvio-german-providers (GNU GPL-3.0-or-later).
// CAPTCHA and anti-bot protections are not bypassed.
const BASE = "https://filmpalast.to";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
const $load = require("cheerio").load;
const CryptoJS = require("crypto-js");

async function request(url, options) {
  const response = await fetch(url, {
    ...(options || {}),
    headers: { "User-Agent": UA, ...((options && options.headers) || {}) }
  });
  if (!response.ok) throw new Error("HTTP " + response.status + " " + url);
  return response;
}
async function getText(url, options) { return (await request(url, options)).text(); }
async function getJson(url, options) { return JSON.parse(await getText(url, options)); }
function origin(url) { return url.match(/^https?:\/\/[^/]+/i)[0]; }
function all($, selector, context) { return (context ? $(selector, context) : $(selector)).toArray().map(e => $(e)); }
function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}
function score(title, year, meta) {
  const t = norm(title); let value = 0;
  for (const m of meta.titles.map(norm)) {
    if (t === m) value = Math.max(value, 3);
    else if (m.length > 3 && (t.includes(m) || m.includes(t))) value = Math.max(value, 1);
  }
  if (year && meta.year) {
    const d = Math.abs(Number(year) - meta.year);
    value += d === 0 ? 2 : d === 1 ? 1 : -2;
  }
  return value;
}
function pickBest(items, meta) {
  let best = null, bestScore = 2;
  for (const item of items) {
    const value = score(item.title, item.year, meta);
    if (value > bestScore) { best = item; bestScore = value; }
  }
  return best;
}
async function getMeta(tmdbId, mediaType) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const data = await getJson("https://api.themoviedb.org/3/" + type + "/" +
    encodeURIComponent(tmdbId) + "?api_key=" + encodeURIComponent(globalThis.TMDB_API_KEY) +
    "&language=de-DE&append_to_response=external_ids,translations,alternative_titles,seasons");
  const translations = (data.translations || {}).translations || [];
  const english = translations.find(t => t.iso_639_1 === "en" && t.iso_3166_1 === "US") ||
    translations.find(t => t.iso_639_1 === "en");
  const alternatives = ((data.alternative_titles || {}).titles ||
    (data.alternative_titles || {}).results || [])
    .filter(a => a.iso_3166_1 === "DE" || a.iso_3166_1 === "AT").map(a => a.title);
  const title = data.title || data.name;
  const originalTitle = data.original_title || data.original_name;
  const englishTitle = english && english.data && (english.data.title || english.data.name);
  const date = data.release_date || data.first_air_date || "";
  return {
    type, title, year: date ? Number(date.slice(0, 4)) : null,
    titles: [title, originalTitle, englishTitle].concat(alternatives)
      .filter((t, i, a) => t && a.indexOf(t) === i)
  };
}
function pad(n) { return String(n).padStart(2, "0"); }
async function findPage(meta, season, episode) {
  const tag = meta.type === "tv" ? " S" + pad(season) + "E" + pad(episode) : "";
  for (const title of meta.titles) {
    const $ = $load(await getText(BASE + "/search/title/" + encodeURIComponent(title + tag)));
    const items = all($, "#content .glowliste h2 a").map(a => {
      const label = a.attr("title") || "";
      const match = label.match(/^(.*) S(\d+)E(\d+)$/);
      const href = a.attr("href") || "";
      return {
        title: match ? match[1] : label,
        s: match && Number(match[2]), e: match && Number(match[3]),
        url: href.startsWith("http") ? href : new URL(href, BASE).href
      };
    }).filter(item => tag ? item.s === season && item.e === episode : !item.s);
    const hit = pickBest(items, meta);
    if (hit) return hit.url;
  }
  return null;
}
function scripts(html) {
  return (html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [])
    .map(s => s.replace(/^<script[^>]*>|<\/script>$/gi, ""));
}
function quality(label) {
  const match = String(label || "").match(/(\d{3,4})p/i) || String(label || "").match(/^(\d{3,4})$/);
  return match ? match[1] + "p" : "auto";
}
function unpack(html) {
  const packed = (html.match(/eval\(function\(p,a,c,k,e,[\s\S]*?\.split\('\|'\)[^)]*\)\)/) || [])[0];
  const match = packed && packed.match(/\}\s*\('([\s\S]*)',\s*(.*?),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'/);
  if (!match) return null;
  const payload = match[1].replace(/\\'/g, "'");
  const radix = parseInt(match[2], 10) || 36;
  const words = match[4].split("|");
  if (words.length !== Number(match[3])) return null;
  return payload.replace(/\b\w+\b/g, word => words[parseInt(word, radix)] || word);
}
function jwplayer(script, base) {
  const fix = value => {
    value = value.replace(/\\\//g, "/");
    if (/^https?:/i.test(value)) return value;
    if (value.startsWith("//")) return "https:" + value;
    if (value.startsWith("/")) return origin(base) + value;
    return origin(base) + "/" + value;
  };
  const out = []; const re = /"?sources"?:\s*(\[.*?\])/g; let match;
  while ((match = re.exec(script))) {
    try {
      const json = match[1].replace(/"?(file|label|type)"?\s*:/g, '"$1":').replace(/'/g, '"');
      for (const item of JSON.parse(json)) if (item.file)
        out.push({ url: fix(item.file), quality: quality(item.label) });
    } catch (_) {}
  }
  if (!out.length) {
    const urlRe = /[:=]\s*"([^"\s]+(\.m3u8|master\.txt)[^"\s]*)/g;
    while ((match = urlRe.exec(script))) out.push({ url: fix(match[1]), quality: "auto" });
  }
  return out;
}
function decrypt(cipherBytes, key, iv) {
  return CryptoJS.AES.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext: cipherBytes }), key,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
}
async function voe(url, referer) {
  let html = await getText(url, { headers: { Referer: referer || url } });
  const redirect = html.match(/window\.location\.href\s*=\s*'([^']+)';/);
  if (redirect) { url = new URL(redirect[1], url).href; html = await getText(url, { headers: { Referer: referer || url } }); }
  const json = (html.match(/<script type="application\/json">([\s\S]*?)<\/script>/) || [])[1];
  if (!json) return [];
  let value = json.trim().replace(/^\["/, "").replace(/"\]$/, "");
  value = value.replace(/[a-zA-Z]/g, c => String.fromCharCode((c.charCodeAt(0) - (c <= "Z" ? 65 : 97) + 13) % 26 + (c <= "Z" ? 65 : 97)));
  for (const token of ["@$", "^^", "~@", "%?", "*~", "!!", "#&"]) value = value.split(token).join("_");
  value = atob(value.replace(/_/g, "")).split("").map(c => String.fromCharCode(c.charCodeAt(0) - 3)).reverse().join("");
  const data = JSON.parse(atob(value));
  const headers = { Referer: origin(url) + "/", Origin: origin(url) };
  const out = [];
  if (data.source) out.push({ url: data.source, quality: "auto", headers });
  if (data.direct_access_url) out.push({ url: data.direct_access_url, quality: "auto", headers: { Referer: url } });
  return out;
}
async function dood(url) {
  const embed = url.replace("/d/", "/e/");
  const response = await request(embed);
  const html = await response.text();
  const host = origin(response.url || embed);
  const pass = (html.match(/\/pass_md5\/[^']*/) || [])[0];
  if (!pass) return [];
  const prefix = await getText(host + pass, { headers: { Referer: response.url || embed } });
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 10; i++) token += alphabet[Math.floor(Math.random() * alphabet.length)];
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  return [{ url: prefix + token + "?token=" + pass.split("/").pop() + "&expiry=" + Date.now(),
    quality: quality(title), headers: { Referer: host + "/" } }];
}
async function vidstack(url) {
  const hash = url.split("#").pop().split("/").pop();
  const encrypted = (await getText(origin(url) + "/api/v1/video?id=" + hash, {
    headers: { "User-Agent": "Mozilla/5.0 Firefox/134.0" }
  })).trim();
  const key = CryptoJS.enc.Utf8.parse("kiemtienmua911ca");
  for (const ivText of ["1234567890oiuytr", "0123456789abcdef"]) {
    try {
      const text = decrypt(CryptoJS.enc.Hex.parse(encrypted), key, CryptoJS.enc.Utf8.parse(ivText))
        .toString(CryptoJS.enc.Latin1);
      const source = (text.match(/"source":"(.*?)"/) || [])[1];
      if (source) return [{ url: source.replace(/\\\//g, "/"), quality: "auto",
        headers: { Referer: url, Origin: origin(url) } }];
    } catch (_) {}
  }
  return [];
}
async function genericHost(url, referer, kind) {
  const embed = kind === "dood" ? url.replace("/d/", "/e/") :
    kind === "vidhide" ? url.replace(/\/(d|download|file|f)\//, "/v/") :
    kind === "streamwish" ? url.replace(/\/[fe]\//, "/") :
    kind === "mixdrop" ? url.replace("/f/", "/e/") : url;
  const html = await getText(embed, { headers: { Referer: referer || embed } });
  let script = unpack(html) || scripts(html).find(s => s.includes("sources:")) || "";
  if (kind === "supervideo") script = unpack(html) || "";
  if (kind === "filemoon") {
    const iframe = (html.match(/<iframe[^>]+src="([^"]+)"/) || [])[1];
    if (iframe) { const inner = await getText(new URL(iframe, embed).href, { headers: { Referer: embed } }); script = unpack(inner) || inner; }
  }
  if (kind === "mixdrop") {
    const link = ((unpack(html) || html).match(/wurl.*?=.*?"(.*?)";/) || [])[1];
    return link ? [{ url: link.startsWith("//") ? "https:" + link : link, quality: "auto", headers: { Referer: url, "User-Agent": UA } }] : [];
  }
  if (kind === "vidoza") {
    const line = (html.match(/sourcesCode:\s*(\[[^\n]*\])/) || [])[1];
    if (!line) return [];
    return JSON.parse(line.replace(/"?(src|type|label|res)"?\s*:/g, '"$1":'))
      .map(s => ({ url: s.src, quality: quality(s.res || s.label), headers: { Referer: url } }));
  }
  if (kind === "streamtape") {
    const line = (html.match(/botlink'\)\.innerHTML\s*=\s*([^\n;]+)/) || [])[1];
    if (!line) return [];
    const value = line.split("+").map(part => {
      let s = (part.match(/'([^']*)'/) || [])[1] || "";
      let m; const re = /\.substring\((\d+)\)/g;
      while ((m = re.exec(part))) s = s.substring(Number(m[1]));
      return s;
    }).join("");
    return value ? [{ url: "https:" + value + "&stream=1", quality: "auto", headers: { Referer: url } }] : [];
  }
  return jwplayer(script, embed).map(s => ({ ...s, headers: {
    Referer: origin(embed) + "/", Origin: origin(embed), "User-Agent": UA
  }}));
}
const HOSTS = [
  ["voe", ["voe.sx","goofy-banana.com","urochsunloath.com","donaldlineelse.com","charlestoughrace.com","tubelessceliolymph.com","simpulumlamerop.com","nathanfromsubject.com","yip.su","metagnathtuggers.com"]],
  ["vidstack", ["moflix.upns.xyz","moflix.rpmplay.xyz"]],
  ["supervideo", ["supervideo","dropload","abstream.to","dr0pstream.com"]],
  ["vidhide", ["vidhide","filelions","ryderjet.com","moflix-stream.click","smoothpre.com","dhtpre.com","peytonepre.com"]],
  ["streamwish", ["streamwish","luluvdo.com","streamruby.com","savefiles.com","wishembed","swdyu.com","strwish"]],
  ["mixdrop", ["mixdrop","mixdrp","mxdrop","mdy48tn97.com"]],
  ["filemoon", ["filemoon"]], ["vidoza", ["vidoza.net","videzz.net"]],
  ["streamtape", ["streamtape","watchadsontape.com","shavetape.cash"]]
];
const BLOCKED = ["dood","d000d.com","vide0.net","dsvplay.com","dooodster.com","doods.pro","playmogo.com","d0000d.com","ds2play.com","doodstream.com","do7go.com"];
function hostOf(url) { return (url.match(/^https?:\/\/(?:www\.)?([^/:?#]+)/i) || [])[1] || ""; }
function listed(host, names) { return names.some(n => host === n || (!n.includes(".") && host.includes(n))); }
async function resolveEmbed(url, referer) {
  if (!url) return [];
  if (url.startsWith("//")) url = "https:" + url;
  const host = hostOf(url).toLowerCase();
  if (listed(host, BLOCKED)) return [];
  try {
    const hit = HOSTS.find(([, names]) => listed(host, names));
    let streams;
    if (hit && hit[0] === "voe") streams = await voe(url, referer);
    else if (hit && hit[0] === "vidstack") streams = await vidstack(url);
    else if (hit) streams = await genericHost(url, referer, hit[0]);
    else {
      const html = await getText(url, { headers: { Referer: referer || url } });
      if (html.includes("/pass_md5/")) streams = await dood(url);
      else if (html.includes("sourcesCode:")) streams = await genericHost(url, referer, "vidoza");
      else if (html.includes("botlink').innerHTML")) streams = await genericHost(url, referer, "streamtape");
      else if (html.includes("application/json") && /window\.location\.href|voe/i.test(html)) streams = await voe(url, referer);
      else streams = jwplayer(unpack(html) || scripts(html).find(s => s.includes("sources:")) || "", url);
    }
    return (streams || []).filter(s => s.url).map(s => ({ ...s, host }));
  } catch (error) {
    console.error("[FilmPalast extractor] " + host + ": " + (error.message || String(error)));
    return [];
  }
}
module.exports = {
  async getStreams(tmdbId, mediaType, season, episode) {
    try {
      const meta = await getMeta(tmdbId, mediaType);
      const pageUrl = await findPage(meta, season, episode);
      if (!pageUrl) return [];
      const $ = $load(await getText(pageUrl));
      const mirrors = all($, "#content ul.currentStreamLinks").map(ul => {
        const a = $("a.iconPlay", ul).first();
        return { host: $(".hostName", ul).text().trim(), link: a.attr("data-player-url") || a.attr("href") };
      }).filter(m => /^https?:/i.test(m.link || "")).slice(0, 6);
      const groups = await Promise.all(mirrors.map(async mirror => {
        const resolved = await resolveEmbed(mirror.link, BASE + "/");
        return resolved.map(stream => ({
          name: "FilmPalast · Deutsch",
          title: (mirror.host || stream.host) + " · Deutsch" +
            (stream.quality && stream.quality !== "auto" ? " · " + stream.quality : ""),
          url: stream.url, quality: stream.quality || "auto", headers: stream.headers || { Referer: BASE + "/" }
        }));
      }));
      return [].concat(...groups).slice(0, 16);
    } catch (error) {
      console.error("[FilmPalast] " + (error.message || String(error)));
      return [];
    }
  }
};
