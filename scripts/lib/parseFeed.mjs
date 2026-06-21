import { decodeEntities, stripCdata, stripHtml } from "./text.mjs";

function tag(block, name) {
  // namespaced-safe: matches <name ...>...</name> for the first occurrence
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(stripCdata(m[1])).trim() : "";
}

function attr(block, name, a) {
  const re = new RegExp(`<${name}[^>]*\\b${a}=["']([^"']+)["'][^>]*/?>`, "i");
  const m = block.match(re);
  return m ? m[1] : "";
}

/** Atom: prefer <link rel="alternate" type="text/html"> over rel="self". */
function atomLink(block) {
  const links = [...block.matchAll(/<link\b[^>]*\/?>/gi)].map((m) => m[0]);
  const alt = links.find((l) => /rel=["']alternate["']/i.test(l)) || links.find((l) => !/rel=["']self["']/i.test(l)) || links[0] || "";
  return attrFrom(alt, "href");
}
function attrFrom(tagStr, a) {
  const m = tagStr.match(new RegExp(`\\b${a}=["']([^"']+)["']`, "i"));
  return m ? m[1] : "";
}

export function parseFeed(xmlText) {
  const xml = String(xmlText || "");
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  // Scope feedTitle to <channel> (RSS) or <feed> (Atom) to avoid picking up a nested
  // item <title> that appears before the channel-level <title> in the raw document.
  const channelMatch = !isAtom && xml.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
  const channelXml = channelMatch ? channelMatch[1] : xml;
  const feedTitle = tag(channelXml, "title");
  const blocks = isAtom
    ? [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0])
    : [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);

  const items = blocks.map((b) => {
    const rawDesc = isAtom ? tag(b, "summary") || tag(b, "content") : tag(b, "description");
    return {
      title: tag(b, "title"),
      link: isAtom ? atomLink(b) : tag(b, "link"),
      date: isAtom ? tag(b, "updated") || tag(b, "published") : tag(b, "pubDate"),
      excerpt: stripHtml(rawDesc),
      guid: isAtom ? tag(b, "id") : tag(b, "guid"),
      videoId: tag(b, "yt:videoId"),
      thumbnail: attr(b, "media:thumbnail", "url"),
      views: attr(b, "media:statistics", "views"),
    };
  });
  return { feedTitle, items };
}
