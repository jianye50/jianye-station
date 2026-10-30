---
title: 🎧Jianye Music｜My homemade web music player
desc: "Project address: https://jianye.pages.dev/music I have always wanted to have a listening page that is entirely my own, without being disturbed by client ads or pop-up windows, so..."
tags: ["music"]
date: 2026-10-24
minutes: 4
cover: 1739621032672.jpeg
background: 1739621032672.jpeg
lang: en
auto: true
srcHash: 70acab89b16a2035
translatedAt: 2026-10-30T13:48:37.996Z
---
> Project address: [https://jianye.pages.dev/music](https://jianye.pages.dev/music)

![ScreenShot_2026-10-25_022056_497](ScreenShot_2026-10-25_022056_497.png)

I have always wanted to have a music-listening page that is entirely my own, without being disturbed by client-side advertisements or pop-up windows, so I took the time to hand-write **Jianye Music**, a pure front-end web music player that replicates the design language of Apple Music. You can use it directly by opening the browser without downloading any software.

## ✨Design: Drawing on the minimalist aesthetic of Apple Music
The interface refers to the design style of Apple Music, with extensive use of **large rounded corners, frosted glass texture, soft gradients, and comfortable white space**.
- Completely supports three sets of themes: **Dark/Light/Follow the system**, which can be automatically adapted to mobile phones, tablets, and computers;
- Ambient light dynamic background: a soft gradient glow will be automatically rendered based on the song being played;
- Responsive layout: Three-column layout on the computer side, the tablet automatically closes the right playback panel, and the mobile phone automatically switches to the side drawer + the mini playbar at the bottom.

## 🎵Core functions at a glance
### 📚Songlist and music library
It has built-in multiple sets of selected playlists classified by mood: Midnight Radio, Cantonese Golden Age, Commuting Rhythm, Focus on Piano, Japanese OST, Folk Folk, Passionate Rock, and Night Electronics.
- Supports **Kugou I Like Music Synchronization**, which can automatically pull the songs collected by Kugou to the web page for playback. Massive collections can also be loaded smoothly;
- Supports search, enter song title and artist to retrieve tracks;
- Each playlist has built-in search filters, and you can quickly locate the songs you want to listen to even with thousands of songs.

### ▶Playback ability
- Basic playback control: sequence, random, single loop; previous song, next song, progress drag adjustment;
- **Playback speed**: 0.5×‑2.0× adjustable, with timer off (15/30/60 minutes);
- Complete lyrics support, including translated lyrics, and the full-screen playback page can scroll to highlight the current line of lyrics;
- Play queue management, you can add songs to the queue, set it to be played next, and delete queue tracks;
- Media session adaptation: The system notification bar of computers and mobile phones can directly control playback, pause and switch songs;
- Supports single song download, and the browser saves the audio file directly.

### ❤Personal database (all saved locally in the browser)
> All collections and playback records** are only saved locally in your browser's localStorage and are not uploaded to any server**. Privacy is priority.
1. **My Favorite Music**: Collect favorite songs, support exporting JSON backup, importing backup files, and you can also migrate the collection list when changing browsers;
2. **Recently Played**: Automatically record the songs you have listened to, and save up to 24 playback histories;
3. Playlist collection: You can collect the recommended playlist built into the page;
4. Playback status memory: Refresh the web page, close the tab and reopen it, and the last playback progress and playback queue will be automatically restored.

### ⌨Shortcut key support
You can operate the player without a mouse:
- Space: play/pause
- Left and right direction keys: fast forward 5 seconds, rewind 5 seconds
- Up and down arrow keys: adjust the volume
- N/P: next song / previous song
- `/` Quickly jump to the search page
- ESC: Close full-screen playback and close pop-up menu

## 🛠Technical implementation
The entire page is a single page of HTML+CSS+native JavaScript. **No framework (Vue/React) is used**. It is all handwritten and deployed on Pages static hosting.
1. CSS variables implement complete multi-themes, `backdrop‑filter` implements frosted glass UI;
2. Native Audio serves as the core of the player, and MediaSession is connected to system media control;
3. localStorage stores all user collections and playback status, and the data remains local;
4. Connect to the music analysis interface to complete song search, obtain sound sources, cover images, and lyrics;
5. Optimize rendering performance for large playlists. The queue only renders visible nearby clips to prevent page freezes caused by thousands of songs.

## 📱Tips for use
1. Open the link directly to use, **no registration and login required**;
2. Collections and playback records are only saved in the current browser. If you clear the browser, the data will be lost. Remember to export your favorite music for backup;
3. The Kugou synchronization function is only available when deployed in an online environment. Directly opening an HTML file locally cannot call the cloud synchronization interface;
4. It is recommended to use Chrome, Edge, and Firefox modern browsers. Some of the frosted effects of older browsers will be degraded.

## 💡Write at the end
The original intention of making Jianye Music is to get rid of the bloated client and just want to listen to music quietly.
No screen opening, no push, no complicated community, just return to the music itself. You can open a web page, click on the playlist, minimize the browser, and simply enjoy the music.

If you are interested, you can visit directly: 👉 [https://jianye.pages.dev/music](https://jianye.pages.dev/music)
