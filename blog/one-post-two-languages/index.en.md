---
title: One Post, Two Languages
desc: Write in the language you think in, and let the page meet the reader wherever they are. How this blog decides what to translate, which of three engines does the work, and why a cache key with a direction suffix is the difference between a feature and a nuisance.
tags: ["Writing","Translation","Web"]
date: 2026-11-06
minutes: 7
cover: cover.png
background: cover.png
lang: en
auto: true
srcHash: f9499b92528d3d0a
translatedAt: 2026-11-06T11:38:13.110Z
---
I write in Chinese. Most of what I read about the things I write about is in English. For years that mismatch lived in my head and never reached the page — I would publish an article, a friend abroad would open it, see a wall of characters, and close the tab politely.

The obvious fix is to write everything twice. I tried that for about three posts. It does not survive contact with reality: the second version is always a summary of the first, never a translation of it, and after a few weeks you stop publishing the second version at all.

So the fix moved into the page itself. Every article here now carries a language it was written in, and the site translates on demand into whatever the visitor is reading in. This post is written in English on purpose — if you are reading it in Chinese right now, the machinery below is what put it in front of you.

## The naive version, and why it fails

The first attempt was a button. Click it, the whole page turns into the other language, done. Three things broke immediately:

- **The button is a decision the reader has to make.** Most people do not make it. They leave instead.
- **A whole-page translation has no granularity.** One sentence changes, and you send the entire article through the engine again.
- **Nobody remembers their choice.** Reload the page on a phone and you are back to the original language.

The version that survived inverts all three. There is no button in the normal case — the page detects what language it is in, detects what language the visitor wants, and only acts when those two differ. The unit of work is a block of text, not a document. And the result is cached by content, so a visitor pays for a translation exactly once, no matter how many times they come back.

## Who decides what language this is

Two questions, and they are not the same question:

1. What language does the **visitor** want?
2. What language is **this article** actually written in?

The first has an easy answer: the browser's `navigator.language`, refined by whatever the site's own language switch says. Chinese locales get Chinese; everything else gets English.

The second is where it gets interesting, because file names lie. An article in a folder called `one-post-two-languages` might still be written in Chinese. A file named `index.zh.md` might be an English draft someone forgot to rename.

So the check runs on the content, not the name: count CJK characters against Latin letters, ignore the tags and the code, and let the majority decide. If an article is mostly CJK, it is a Chinese article. If it is mostly Latin letters with almost no CJK, it is an English one. There is no third case worth handling — mixed-script prose is rare enough that the wrong guess costs one paragraph, not one article.

> [!NOTE]
> Direction matters more than it sounds. "Translate to English" and "translate to Chinese" are two completely separate jobs, with separate models, separate caches, and separate failure modes. Treating them as one job with a parameter is what makes the code readable; treating them as one cache is what makes it wrong.

## Three engines, one queue

No single translation service is reliable enough to be the only one. This site uses three, in order:

| Engine | Where it runs | Why it is first |
| --- | --- | --- |
| Chrome built-in Translator | In the visitor's browser | Free, private, no network hop |
| Site proxy | Server-side function | Works on every browser |
| Google Translate endpoint | Direct from the page | Last resort when the proxy is throttled |

The first one deserves a paragraph. Chrome now ships a translation model that runs locally — the text never leaves the device, and there is no quota to exhaust. When it is available, it is unambiguously the best option: zero cost, zero latency after the first load, zero privacy questions.

It is also per-language-pair, and it needs a model download before it can translate anything. So the page does not assume it exists. It asks whether the API is present, whether the specific pair is supported, and whether the model is ready — and if any of those answers is no, the request falls through to the next engine without the reader noticing anything except a slightly longer wait.

> [!WARNING]
> The server-side proxy is not a spare tire you can ignore. Public translation endpoints rate-limit by IP, and a shared cloud IP will hit that limit on a bad day. When it happens, the failure looks like "translation silently stopped working" rather than an error, because the page keeps trying and the queue keeps waiting. Keep a client-side path alive.

## The cache is the feature

Everything above is plumbing. The cache is the actual product decision.

Translating a page is slow enough to be visible — a second or two on a good connection, much worse on a bad one. Doing it again on every visit turns a clever feature into a tax. So every translated block is stored locally, keyed by three things:

- the article it belongs to
- a hash of the source text
- the direction of translation

The hash is what makes edits cheap. Change one paragraph, and only that paragraph's hash changes — the other forty blocks are still valid and never leave the cache. Rewrite the title, and the title is the only thing re-sent.

The direction suffix is the part that is easy to get wrong. Without it, translating an article to English and then back to Chinese overwrites the same slot, and a bilingual reader flipping between versions keeps evicting their own cache. Two directions, two namespaces, no interference.

> [!TIP]
> Keep the old cache keys working when you add the reverse direction. Visitors who read the site before the change still have entries under the original key; reusing that key for the original direction means their cache survives the upgrade, and only the new direction starts empty.

## When a human translation should win

Machine output is good enough for paragraphs. It is not good enough for a title that has to land, a tag list that has to match the site's vocabulary, or a summary that has to convince someone to click.

So the site checks for a hand-written version first. If an article folder contains a sibling file for the other language, that file wins, and the engine never runs. The fallback chain is short and boring on purpose:

1. A human translation, if one exists
2. The local model, if it is ready
3. The server proxy
4. The public endpoint
5. The original text, with a quiet note that translation is unavailable

Step five matters. A page that fails loudly is better than a page that pretends: if all four engines are down, show the original and say so, rather than showing an empty article and letting the reader assume the site is broken.

## What this cannot do

Being honest about the limits is cheaper than discovering them in public.

- **Layout does not translate.** A sentence that fits in one line in English takes two in Chinese. Headings get long, tables get cramped, and no engine will reflow a paragraph for you — that is CSS's job, and it only half-succeeds.
- **Code is a minefield.** Identifiers, file paths, and inline snippets must survive untouched. Anything that round-trips text through a translator needs a way to protect them, and the protection is always slightly leaky.
- **Tone flattens.** My Chinese writing has a rhythm I deliberately chose. The English version has the meaning and not the rhythm. For a technical post that is acceptable; for anything I care about as prose, it is a reason to write the second version myself.
- **The first visitor pays.** Every new article, in the other language, is translated once by whoever arrives first, then cached for everyone after. On a site with ten readers a day, that is fine. On a site with ten thousand, you would precompute.

## The short version

Detect the reader's language and the article's language separately, translate only when they differ, do it block by block so edits stay cheap, cache by content hash and direction, and let a hand-written translation override the machine whenever one exists.

None of that is novel. What made it worth building is that it removed the excuse: the reason this blog had no English version was never the technology. It was that publishing twice is a chore, and people do not do chores. A page that translates itself does not need to be convinced.
