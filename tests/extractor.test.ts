import { describe, expect, test } from "bun:test";
import { extractor, htmlToMarkdown } from "../src/adapters/extractor";

const ARTICLE = `<html><head><title>My Article</title></head><body>
<article>
  <h1>My Article</h1>
  <p>Intro with a <a href="https://example.com">link</a>, some <strong>bold</strong> and <em>italic</em> text, plus <code>inline_code</code>.</p>
  <h2>Section</h2>
  <ul><li>first item</li><li>second item</li></ul>
  <ol><li>one</li><li>two</li></ol>
  <pre><code class="language-ts">const x = 1;</code></pre>
  <blockquote>a wise quote</blockquote>
  <p>${"Filler words for the readable threshold. ".repeat(40)}</p>
  <img src="pic.png" alt="dropped" />
</article>
</body></html>`;

describe("htmlToMarkdown", () => {
  test("headings, links, emphasis, lists, code, blockquote; images dropped", () => {
    const { parseHTML } = require("linkedom");
    const el = parseHTML(ARTICLE).document.querySelector("article");
    const md = htmlToMarkdown(el);
    expect(md).toContain("# My Article");
    expect(md).toContain("## Section");
    expect(md).toContain("[link](https://example.com)");
    expect(md).toContain("**bold**");
    expect(md).toContain("*italic*");
    expect(md).toContain("`inline_code`");
    expect(md).toContain("- first item");
    expect(md).toContain("1. one");
    expect(md).toContain("```ts\nconst x = 1;\n```");
    expect(md).toContain("> a wise quote");
    expect(md).not.toContain("pic.png");
  });
});

describe("extractor", () => {
  function serve(body: string, status = 200, contentType = "text/html"): string {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response(body, { status, headers: { "Content-Type": contentType } }),
    });
    return `http://localhost:${server.port}/article`;
  }

  test("article reduces to markdown with title", async () => {
    const url = serve(ARTICLE);
    const result = await extractor.extract(url);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.title).toBe("My Article");
      expect(result.text).toContain("## Section");
      expect(result.text).toMatch(/\[link\]\(https?:\/\/[^)]*\)/);
    }
  });

  test("paywall/empty page is an error, not garbage", async () => {
    const url = serve("<html><body><div>Login required</div></body></html>");
    const result = await extractor.extract(url);
    expect(result).toEqual({ ok: false, error: "no readable content" });
  });

  test("non-2xx is an error result, never throws", async () => {
    const result = await extractor.extract(serve("nope", 404));
    expect(result).toEqual({ ok: false, error: "HTTP 404" });
  });

  test("robots disallowed", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: (req) => {
        if (new URL(req.url).pathname === "/robots.txt") {
          return new Response("User-agent: *\nDisallow: /private/");
        }
        return new Response(ARTICLE);
      },
    });
    const result = await extractor.extract(`http://localhost:${server.port}/private/article`);
    expect(result).toEqual({ ok: false, error: "disallowed by robots.txt" });
    server.stop(true);
  });
});
