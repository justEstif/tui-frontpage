// defuddle + linkedom extraction — contract in src/md/adapters/extractor.md.
// defuddle is a DEFAULT export (spike-proven; named import fails at runtime).
import Defuddle from "defuddle";
import { parseHTML } from "linkedom";
import type { Extractor } from "../domain/ports";
import { allowed, USER_AGENT } from "./robots";

const MIN_WORDS = 200;

async function get(url: string): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
}

/** Small local HTML → markdown converter over linkedom nodes. Images dropped. */
const DROPPED = new Set(["script", "style", "img", "figure", "svg", "video", "iframe"]);

function linkMd(child: Element, inner: string): string {
  const href = child.getAttribute("href") ?? "";
  return inner ? `[${inner}](${href})` : "";
}

function inlineMd(child: Element): string {
  const inner = htmlToMarkdown(child).trim();
  switch (child.tagName.toLowerCase()) {
    case "strong":
    case "b":
      return `**${inner}**`;
    case "em":
    case "i":
      return `*${inner}*`;
    case "code":
      return `\`${child.textContent ?? ""}\``;
    case "br":
      return "\n";
    case "a":
      return linkMd(child, inner);
    default:
      return inner;
  }
}

function headingMd(child: Element): string {
  const level = Math.min(6, Number(child.tagName[1]) || 1);
  return `\n\n${"#".repeat(level)} ${htmlToMarkdown(child).trim()}\n\n`;
}

function listMd(child: Element): string {
  const ordered = child.tagName.toLowerCase() === "ol";
  const lines: string[] = [];
  let i = 1;
  for (const li of child.querySelectorAll("li")) {
    lines.push(`\n${ordered ? `${i}.` : "-"} ${htmlToMarkdown(li).trim()}`);
    i += 1;
  }
  return `\n${lines.join("")}\n\n`;
}

function preMd(child: Element): string {
  const lang = child.querySelector("code")?.className?.match(/language-(\w+)/)?.[1] ?? "";
  return `\n\n\`\`\`${lang}\n${child.textContent ?? ""}\n\`\`\`\n\n`;
}

function blockquoteMd(child: Element): string {
  const inner = htmlToMarkdown(child).trim();
  return `\n\n${inner
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n")}\n\n`;
}

const HANDLERS: Record<string, (el: Element) => string> = {
  h1: headingMd,
  h2: headingMd,
  h3: headingMd,
  h4: headingMd,
  h5: headingMd,
  h6: headingMd,
  p: (el) => (el.textContent?.trim() ? `\n\n${htmlToMarkdown(el).trim()}\n\n` : ""),
  ul: listMd,
  ol: listMd,
  pre: preMd,
  blockquote: blockquoteMd,
};

export function htmlToMarkdown(el: Element): string {
  const out: string[] = [];
  for (const node of el.childNodes) {
    if (node.nodeType === 3) {
      out.push((node.textContent ?? "").replace(/\s+/g, " "));
      continue;
    }
    if (node.nodeType !== 1) continue;
    const child = node as Element;
    const tag = child.tagName.toLowerCase();
    if (DROPPED.has(tag)) continue;
    const handler = HANDLERS[tag] ?? inlineMd;
    out.push(handler(child));
  }
  return out.join("");
}

export const extractor: Extractor = {
  async extract(url) {
    try {
      const u = new URL(url);
      if (!(await allowed(u.origin, u.pathname + u.search))) {
        return { ok: false as const, error: "disallowed by robots.txt" };
      }
      const res = await get(url);
      if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
      const html = await res.text();
      const doc = parseHTML(html).document;
      const result = new Defuddle(doc, url).parse() as { title?: string; content?: string };
      const contentHtml = result.content ?? "";
      const doc2 = parseHTML(`<body>${contentHtml}</body>`).document;
      const bodyEl = doc2.querySelector("body");
      const text = bodyEl
        ? htmlToMarkdown(bodyEl)
            .replace(/\n{3,}/g, "\n\n")
            .trim()
        : "";
      const words = text.split(/\s+/).filter(Boolean).length;
      if (!result.title || words < MIN_WORDS) {
        return { ok: false as const, error: "no readable content" };
      }
      return { ok: true as const, title: result.title, text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  },
};
