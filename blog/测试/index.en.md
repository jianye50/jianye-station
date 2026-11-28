---
title: test
desc: "-- title: Ink White and Black Gold: Two Temperaments in the Same Skeleton desc: Same site, two sets of skins. One talks about the restraint of paper and ink, and the other talks about the ritual sense of night and lights - the record is only..."
tags: ["theme","color matching","Texture"]
date: 2026-11-21
minutes: 5
cover: 1745762684622.jpg
background: 1745762684622.jpg
lang: en
auto: true
srcHash: 2ec55dda027b8789
translatedAt: 2026-11-28T16:01:07.508Z
---
---
title: Ink white and black gold: two temperaments in the same skeleton
desc: Same site, two sets of skins. One part talks about the restraint of paper and ink, and the other part talks about the ritual sense of night and lights - recording this design experiment that only changed colors and left the structure unchanged.
tags: design, tossing
date: 2026-11-21
minutes: 6
---

This site now has two addresses:

- **Ink White Version**: http://jianye.pages.dev/mono

@link[墨白版](http://jianye.pages.dev/mono)
- **Black Gold Edition**: http://jianye.pages.dev/gold

@link[black gold version](http://jianye.pages.dev/gold)

They are not two websites. The same set of HTML, the same script, the same batch of articles and photos, the routing, player, lightbox, and bilingual switching are all exactly the same. The only difference is the color.

It sounds like a trivial matter like changing the skin, but after doing it, I found that the choice of color actually determines one thing: what does this website want visitors to see first. **

---

## Build the skeleton first, then talk about color

Before changing the color, the two versions share a very rigid set of rules, and it is this set of rules that makes "changing colors" meaningful:

- **Rounded Corner Harvest 2px**. Screen-filling capsules with rounded corners are the language of 2019, and now they look like plastic.
- **All projections are cleared**. The hierarchy is expressed not by floating, but by hairline (1px, about 10% transparency) and white space.
- **Use Song font for the title** and sans-serif for the body text. The Chinese Song style has a sharp stroke, which gives it a sense of solemnity that has been "typeset" when enlarged.
- **Photos are decolored by default**. Whichever picture you point the mouse on, the color will slowly fade away.
- **Numbering instead of icon stacking**. The project card says 01, 02, 03, not a bunch of little colorful squares.

After these are finalized, the page has actually stood up. For the rest of the color, just give it a breath.

---

## Mo Bai: Retreat the color to only the layers

The background color of the ink-white version is `#08080a` and the text is `#f5f2ec`.

None are solid colors. Pure black `#000` is like a hole on the screen, and pure white `#fff` is dazzling; if it is slightly off, it will feel like an "object" - like rice paper, like newsprint that has not been used on the machine.

The design logic of this version is **editorial design**: no color is available, and hierarchy can only be established by font size contrast, kerning, line height, white space, and lines. So it looks like a carefully typed book: the title is large and sparse, the text is in narrow columns, 2.1x line spacing, and chapters are separated by a thin line.

Site-wide color is only allowed to appear in two places: the primary color when the photo is hovered, and the large picture clicked in the light box.

> The ambition of the Mobai version is to "disappear". Visitors should not notice the design, only what you wrote and photographed.

Its pros and cons are actually the same thing: **too quiet**. It's so quiet that it's like a Markdown renderer. It's so quiet that it doesn't look like a "personal homepage" and more like a printed portfolio.

---

## Black Gold: Give status a light

What the Black Gold Edition wants to solve is exactly this problem: how to give the page a sense of "presence" without destroying restraint.

The first step is to change the base. The background color was changed from cold jet black `#08080a` to warm jet black with a little brown `#0a0907` - this little bit of warmth is crucial. Cold black paired with gold will look dirty, while warm black paired with gold will look like an old artifact.

The second step is how to use the deposit. Here I keep a line:

**Gold only appears on "Status", never on "Decoration". **

Specifically, Jin is only responsible for four things:

1. **Where are you**——The current page label has golden text, a thin golden line at the bottom, and a very light halo.
2. **What can be clicked** - text link, secondary button, hover status
3. **Progress to where**——Reading progress bar, player progress ring
4. **Where is the starting point** - the small dot in the logo and the golden line on the startup screen

Other than that, there is no gold at all. The background, photos, text, and large areas of the footer of the project card are still jet black and ivory white.

The gold color itself is also divided into two levels: `#c9a45c` is a matte gold with a more bronze tone, which is not dazzling when used on large areas; `#e8cf96` is brighter and only brightens the hover and current status for a moment. This level is very important - if there is only one gold, the page will appear flat; if the gold is too bright, it will turn into a KTV box.

> If the black and white version is a booklet, the black and gold version is what the book looks like when placed under the spotlight. The content has not changed, the light has.

---

## Compare

| | ink white (mono) | black gold |
|---|---|---|
| background color | Cold black `#08080a` | Warm black `#0a0907` |
| accent color | None (Ivory takes on everything) | Bronze Gold `#c9a45c` / `#e8cf96` |
| where color appears | Only photos and lightbox originals | Photos, plus any "status" |
| temperament | Paper, ink, editing desk | night, lights, showcase |
| first impression | Quiet, durable, and document-like | Stylish and more beautiful at night |
| most suitable | Read long articles, read works, and browse carefully | Display on homepage, share with others, watch late at night |
| Most likely to roll over | So bland that I have no memory | The more gold you have, the more vulgar you become. |

---

## Technically it’s actually very light

The approach is not to write two sets of pages, but to add an independent overlay style sheet before `</body>`, and all adjustable things are collected in `:root`:

```css
:root{
  --ink:#0a0907;      /* 底色 */
  --paper:#f5f2ec;    /* 文字 */
  --gold:#c9a45c;     /* 主金 */
  --gold-2:#e8cf96;   /* 提亮金 */
}
```

The original DOM, script, routing, player, light box, bilingual, and SEO logic have not been changed. Therefore, the functions of the two versions are completely equivalent, and there is no problem of "something is missing from one version".

The advantage is: if you want to add a third version (such as cool gray, ocher, foggy blue), you only need to copy a file and change a dozen variables. The disadvantage is: the overlay will become longer and longer. If you really want to maintain multiple themes for a long time in the future, you should extract it into a CSS variable file + `data-theme` switch instead of copying HTML. I'll save this step until we really need the third version.

---

## Which one to choose?

If I could only keep one, I would choose Mo Bai. It's closer to the original intention of this site: documenting, rather than displaying.

But I'm not going to delete Black Gold. Its existence reminds me of one thing - if you read the same skeleton with a different layer of light, it will be a different story. ** Color is the last step, not the first. If the skeleton is upright, the color is just a breath; if the skeleton is not upright, no matter how expensive the gold is, it is just covering up the ugliness.

If you want to see it, both addresses are at:

- http://jianye.pages.dev/mono
- http://jianye.pages.dev/gold

By the way, if you like any one of them better, please let me know. I've been hesitating about making a switch and letting visitors choose.
