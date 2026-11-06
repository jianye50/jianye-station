---
title: "Blog Editor 2.0: Articles can finally contain videos, animations and sounds"
desc: Rebuild the editor from a Markdown input box into a writing desk that integrates graphics, text, audio and video. Attached is a live demonstration of all new components, as well as nine problems discovered this time.
tags: ["blog","Editor","renew"]
date: 2026-11-01
minutes: 8
cover: cover.png
background: cover.png
lang: en
auto: true
srcHash: 3370556f27a997c9
translatedAt: 2026-11-06T10:14:21.224Z
---
This blog was written by itself from day one: a `index.html`, a minimalist set of Markdown rules, plus a backend editor. The advantage is that it is light, there are no construction steps, and you can view it after refreshing. The disadvantage is also very real - it can only hold "text + pictures" for a long time.

If you want to play a screen recording, you can only post an external link; if you want to play a song, you have to use a third-party player; if you want to view several pictures side by side, you have to write HTML by hand. Over time, half of what should have been in the article was cut off by the shortcomings of the tool.

So I simply redid the editor this time. **The article you are reading now is written using new components**. Scroll down to see the actual effects one by one.

> [!TIP]
> The videos, animations, and audios in the article can be opened directly by clicking on them - click on the pictures and animations to enlarge the original image. The video has its own control bar and there is a zoom button in the upper right corner.

## 1. Video: No longer can you only post external links

The most direct change: local videos can be directly inserted into the text.

![示例片段（CC0 素材）：点右下角可以拖进度](demo.mp4)

There is no need to remember the path or make a cover first. The editor will read the duration, affix corner markers, and occupy the space according to the true proportions - the vertical screen recording will not be artificially cropped into horizontal ones. If the file is not uploaded successfully, or the file name is written incorrectly, it will clearly tell you "This video could not be loaded" instead of leaving a silent black area.

> [!NOTE]
> The above paragraph is an example based on public CC0 materials, just so that you can actually click on the player. To record your own screen, drop the file into the same folder and write a line of `![说明](文件名.mp4)`.

## 2. Animated pictures: moving pictures should not have a pause button

GIFs and videos are grammatically two different things. A video is "a controllable thing" and an animated picture is "a moving painting".

Therefore, the animation ** has no controls, cannot be paused, and has a silent loop **: it will stop automatically when scrolling out of the screen, and it will continue after scrolling back. It saves power and won’t make a sudden sound when you slide down. If you want to see the details, click on it and go to the big picture to take a closer look.

@motion[The same piece of material is played as an animated picture: silent, looping, and no progress bar.](loop.mp4)

> [!NOTE]
> It used to pause when clicked - this is an obvious semantic error, and the "moving picture" is regarded as a player. This time we changed it all together.

## 3. Audio: A Quiet Card

@audio[Gulf of Alaska - Blue Heart Feather](bgm.m4a)

The audio does not occupy the entire line, and is collected into a small card with a title and source tag. It looks the most inconspicuous, but this time the pitfall lies precisely in it:

**The progress bar does not move no matter how I click it. ** After checking the style, level, and event interception for a long time, the result has nothing to do with these - the server returns this `.m4a` without `Accept-Ranges`, and the jumpable range read by the browser is `0 ~ 0`, which is equivalent to telling the player that "this section can only be played from the beginning to the end." The file has actually been downloaded a long time ago, but I can’t drag it if I can’t drag it.

The current process is: once this "unjumpable" state is detected, the entire data is converted into a Blob and then hung back to the player, and dragging resumes immediately. The data is already in the HTTP cache and costs almost no extra traffic.

## 4. Links and attachments: two types of "things that are not pictures"

The previous link was just a line of blue text, and the attachment could only be a network disk address. Now they each have their own look:

@link[Jianye’s small station](https://jianye.pages.dev/ "个人博客 · 记录折腾过的一切")

The link card will generate a fixed color based on the domain name. The same site will always be the same color block; it has a title and description, which is much more decent than a bare address.

@file[Full description of this update (Markdown)](更新说明.md)

The attachment card displays the extension color block and the original file name. Click to download directly. The compressed package, instructions, and forms all follow this style.

Also `@embed[...](B站 / YouTube / Vimeo 链接)`: If you recognize the platform, switch to the player. Unrecognized sites will automatically degenerate into link cards without leaving a blank box. I didn’t include it in this article because I didn’t want to add someone else’s video to fill up the list.

## 5. Picture Gallery: Look at several pictures side by side

@gallery[shot-list.png, shot-post.png, shot-mobile.png]

Two to four pictures are automatically divided into columns, down to two columns on a narrow screen, and each picture can be clicked to see the original picture. The above three pictures are what this site looks like now: article list, article page, mobile terminal - the same set of renderings, three widths.

## 6. Prompt block: Give the key point a color

Some words are not suitable to be buried in paragraphs and need to have a blocky presence. GitHub supports all five writing methods:

> [!IMPORTANT]
>Important conclusions are placed here - those who scan can see them at a glance.

> [!WARNING]
> Put here the areas that will cause people to trip up, such as "back up before deleting".

> [!CAUTION]
> Something more serious than a warning: irreversible and data loss.

The colors and icons are different, and to write it is just `> [!TIP]` plus a line of content, no need to remember HTML.

## 7. To-do list: Can you really tick it off?

- [x] Media: Video / GIF / Audio
- [x] Content blocks: link card / attachment card / gallery
- [x] Tip blocks and to-do lists
- [x] Pictures, videos, and animations are open to a large number of clicks
- [ ] Add a caption to the picture
- [ ] Make the update log a separate page

The above checkboxes can be clicked. When you click on the site, the status will be recorded locally in the browser and the article file will not be changed; when you click on the preview of the editor, it will be directly changed back to the text, and after saving, it will actually be written into `index.md`.

## 8. Typesetting: alignment, tables, code

|c This line is centered. Use the left/middle/right buttons on the toolbar to click it.

|c In the past, "centering" was stuffed into the "Insert" panel - if you want to center the selected text, you have to go to the insert menu and scroll through it, which is logically wrong. It is now back in the text formatting group, next to bold and italics.

| ability | grammar | illustrate |
| --- | --- | --- |
| video | `![说明](x.mp4)` | With control bar, can zoom in |
| GIF | `@motion[说明](x.mp4)` | Silent loop, cannot be paused |
| Audio | `@audio[说明](x.m4a)` | Small card, draggable |
| link card | `@link[标题](url "描述")` | Pick color by domain name |
| appendix | `@file[名称](x.zip)` | Direct download |
| Album | `@gallery[a.png, b.png]` | 2 to 4 sheets |
| prompt block | `> [!TIP]` | five styles |
| To-do | `- [ ]` | Can be checked |

> [!NOTE]
> Alignment is not included in this table because its syntax contains a vertical bar, and writing it into the table will cut the table. Writing `|c 文字` at the beginning of the line means centering, and the same goes for `|l` and `|r` - this is how the two centered paragraphs above came about.

The code block remains the same:

```javascript
const blocks = ["video", "motion", "audio", "gallery"];
blocks.forEach(kind => console.log(`已支持：${kind}`));
```

> The quotation block remains the same, with a vertical line on the left and slightly lighter text - suitable for an excerpt, or a paragraph that should not be skipped.

## 9. Editor itself

This round of interfaces are all aligned with the site’s vision: the same color scheme, the same glass-textured floating navigation, and the same rounded corner language. As I write, I won’t suddenly feel like I’m using a strange backstage.

The mobile phone used to "shrink the desktop interface and squeeze it in", but now it has been really rearranged: it is divided into three columns: "Text/Materials/Settings", the toolbar can slide horizontally, and the most important save button is fixed at the bottom, and it will not be covered when the keyboard pops up.

Chinese-English bilingual and website share the same switch. If you switch it once, both sides will change simultaneously.

By the way, the "💾 Save to local" button that is placed in the most conspicuous position but has never been bound to a click event can finally be used this time. The worst thing about this kind of button is that it looks completely normal. When you click it after writing, nothing will happen, and then you think it is saved.

## 10. Nine questions unearthed this time

| symptom | real reason |
| --- | --- |
| Click to preview the whole page stuck | The main rendering loop is idling: no one wants a certain line, and no one is moving forward. |
| Mobile phone → tablet → desktop switching suddenly hard to switch | Animating two width attributes at the same time, they are clamped on one side when taking the minimum value. |
| GIFs can be paused | The remaining pause mask has not been deleted. |
| Pictures and videos cannot be enlarged | The lightbox only serves photo albums and does not receive text. |
| Can't check the to-do box | `disabled` is hardcoded when rendering, and `pointer-events:none` is added to the CSS. |
| Save button does not respond | The incident is not tied at all |
| Two copies appear in the media library | Three concurrent refreshes, the same batch of files are repeatedly stuffed into the array |
| The audio progress bar cannot be dragged | The server did not return `Accept-Ranges`, and the jumpable range is zero. |
| The mobile device has not changed | The three gears are all clamped to the same number by the panel width. |

They are listed here because most of them are not "written wrongly", but "look right, but actually don't work" - they will only be exposed if you actually click and drag them again.

## Write at the end

The changes all fall into two files: `index.html` (site and renderer) and `admin/index.html` (editor). There is no build process and no dependencies. Once the changes are made, the changes are done. A backup of the old version is kept, and the entire file can be rolled back at any time.

> [!TIP]
> If you are also using a self-built static blog, my suggestion is: smooth the path of "writing" first. Only when you are comfortable with the tool will you be willing to write more. In turn, a save button that doesn't work is enough to keep people from wanting to open it for the entire night.
