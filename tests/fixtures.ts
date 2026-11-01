// Shared fixtures for adapter tests.
export function rssFor(base: string): string {
  return `<rss version="2.0"><channel>
  <title>Example Blog</title>
  <item><title>Post One</title><link>${base}/1</link></item>
  <item><title>Post Two</title><link>${base}/2</link></item>
</channel></rss>`;
}

export const RSS = rssFor("https://example.com");

export const ARTICLE = `<html><head><title>My Article</title></head><body>
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
