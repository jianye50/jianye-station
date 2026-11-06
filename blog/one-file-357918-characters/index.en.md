---
title: One file, 357,918 characters
desc: This blog is a single HTML file with no build step, no framework and no dependencies. It started as laziness and turned into a constraint that made every decision easier. Here is what it buys, what it costs, and where I would stop doing it.
tags: ["Web","Writing","Craft"]
date: 2026-11-06
minutes: 6
cover: cover.png
background: cover.png
lang: en
auto: true
srcHash: 363eb69958708dd9
translatedAt: 2026-11-06T12:25:19.367Z
---

There is one file. It is `index.html`, it is 357,918 characters long, and it is the entire site. No bundler, no `node_modules`, no deploy pipeline beyond uploading it. When I want to publish, I edit the file and push.

People assume this is a limitation I am working around. It started as laziness, honestly — I wanted a blog on a Sunday afternoon and did not want to spend it choosing a static site generator. What surprised me is that the constraint kept paying rent. Fifteen months later I would choose it again, with two exceptions I will get to.

## The constraint does the design work

A framework gives you options. Options are not free: every one of them is a decision you have to make, and most of them you will make badly at 1 a.m.

With a single file, half the decisions are already made for me:

- **No dependency upgrades**, because there are no dependencies. The site has not broken once in fifteen months for a reason unrelated to my own code.
- **No build step**, so there is no gap between what I wrote and what runs. When something looks wrong, the file that produced it is the file I can read.
- **No routing library**, so navigation is sixty lines of `hashchange` handling that I fully understand — including the part where the browser restores scroll in the wrong place.
- **No CSS architecture debate.** There is one stylesheet, at the top, in the same file, and it is 4,000 lines because I never had to justify any of them.

The last one cuts both ways. More on that below.

## What it actually costs

I will not pretend the file is pleasant to open on a slow laptop. Three things genuinely hurt:

1. **Search is the only navigation.** `Ctrl+F` finds `function renderPost` instantly; it does not help me remember that the thing I want is inside a `setTimeout` in a 900-line block called `wireMedia`.
2. **Merge conflicts are total.** Two edits to the same file never merge. Since I am the only writer this is theoretical, but it is the reason I would never recommend this shape to a team.
3. **Every load parses everything.** The browser reads 350 KB of markup and script to show a 2,000-character post.

That third one sounds worse than it is. Gzipped it is about 55 KB, and the parse happens once. A reader who stays for thirty seconds and one who stays for ten minutes pay the same. Compared with the 300 KB of JavaScript a typical marketing page ships to render a headline, this is not the absurd choice it looks like.

> The real test of an architecture is not how it handles the first feature. It is how it handles the fortieth, when you have forgotten why the first one was built the way it was.

## Where I would stop

Two places, and both of them are about state I cannot hold in my head.

The first is anything with more than one writer. The moment a second person needs to touch this file, the whole argument collapses — not because the code gets worse, but because the coordination cost moves from "never" to "constantly".

The second is anything that has to be resumed. The editor that lives at `/admin` already pushes against the limit: draft recovery, upload queues, per-post history. That code is the least pleasant part of the file, and it is not an accident. A single file is very good at rendering and very bad at keeping a timeline.

## The part I did not expect

The constraint changed what I write about. When publishing costs one edit, I publish more, and I publish smaller things — a note, a screenshot, a paragraph that would not survive the ceremony of a "real" post on a heavier site.

That is worth more than the 55 KB.
