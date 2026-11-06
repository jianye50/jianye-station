---
title: "Edge runtimes are not servers: what Workers can and cannot catch"
desc: "Stuffing a server into a CDN node sounds like a free pick. The real situation is: it can only handle tasks such as \"requests coming in and data going out\", and it cannot handle anything that needs to be \"always awake\". This article explains where that dividing line is, and why I moved OpenList up but left Home Assistant in the closet."
tags: ["Cloudflare","Architecture","Essay"]
date: 2026-11-06
minutes: 6
cover: cover.png
background: cover.png
lang: en
auto: true
srcHash: 7b43b74caa820419
translatedAt: 2026-11-06T12:26:02.580Z
---

When I deployed the Worker online for the first time, I stared at the `*.workers.dev` domain name for a long time, and I always felt that something was missing. Later I figured it out: the "machine" was missing. There is no SSH, no `systemctl`, no `/var/log`, and no process that was killed by OOM at three in the morning because the memory reached 95%.

It runs like this, without spending a penny, and the quota of 100,000 requests per day cannot be used up.

## 1. What is it?

The official term is "JavaScript executed at edge nodes." This sentence can easily be misunderstood as "small server", but it is not. A more accurate statement is: **A function is executed when the request comes and ends when it returns. **

This brings three hard boundaries, which must be recognized before writing code:

1. **No file system. ** What is written cannot be read next time. To save things, you have to use KV, D1, R2 or your own external database.
2. **There is no resident process. ** There are scheduled tasks, but the details are down to the minute level; if you want to "check the device status every five seconds", it can't do the job.
3. **CPU time is a hard cap. ** A single request takes 10 milliseconds for the free version and 30 seconds for the paid version. Note that this is CPU time, not waiting time - waiting two seconds to make an HTTP request doesn't count, but you can't count the hash in those two seconds.

One more thing that is easily overlooked: **cannot enter your intranet by default**. It can send out requests, but it cannot see your NAS, your router, or the small host running Home Assistant at home.

```toml
# wrangler.toml - the entire "machine configuration" of a Worker
name = "file-list"
main = "src/index.ts"
compatibility_date = "2026-10-01"

[[d1_databases]]
binding = "DB"
database_name = "openlist"
database_id = "xxxxxxxx"
```

Just a few lines, no Dockerfile, no Nginx, no certificate renewal.

## 2. What kind of work is suitable for posting?

There is actually only one judgment criterion: **Is this program "requesting in → getting data → returning"? **

If so, it can basically be moved. for example:

- **File List/Network Disk Aggregation**. This is how the TypeScript version of OpenList works: the file itself is in Alibaba Cloud Disk, OneDrive, and S3, and the program itself is only responsible for "asking what is there and giving me the link." If the data is not in its hands, it does not need a hard drive.
- **API Gateway/Reverse Generation/Authentication**. Come in and check a JWT, forward it to the upstream, and process the JSON that comes back.
- **Webhook Relay**. GitHub pushes it and it forwards to Telegram.
- **Small interfaces for short links, image bed indexes, and static stations**.

What these programs have in common: **They have no "own state"**. The state is all in others, and I am just the thin layer of glue in the middle.

## 3. What kind of work cannot be moved?

On the other hand, as long as the program needs to "always be awake", forget about it.

| ability | OpenList-Worker | Home Assistant |
| --- | --- | --- |
| where is the data | Remote network disk, use HTTP to get it | Local device, directly connected via LAN |
| Need to be resident | No need, we will do it after the request comes. | Required, 7×24 event loop |
| Need to connect hardware | unnecessary | Zigbee, Bluetooth, USB gateway |
| Where is the status stored? | D1/KV, can be lost at any time | Local SQLite, high-frequency writes |
| The consequences of moving to the edge | Save money, faster | Unplug all devices and completely disable them |

Home Assistant is a particularly good counterexample. Its entire value is based on the fact that "it is on the same network segment as your lights" - when the device status changes, it must know immediately; when you press the switch, it must immediately send instructions. Move it to a computer room two thousand kilometers away from your home, and it will not be able to connect to any device, leaving only an empty shell web page.

So what I did later was the other way around: **The brain stayed in the closet, and the edges only worked as hands and feet. ** Home Assistant runs on the old laptop at home and uses Cloudflare Tunnel to get out; Worker only does miscellaneous tasks on the side - receiving webhooks, sending notifications, and doing a layer of authentication. If you really want to take a look at the lights in the living room remotely, you are going through a tunnel, not moving your home.

## 4. My current judgment order

When encountering a new project, I will ask myself in this order:

1. Do you have its data? → Don’t move yet.
2. Does it need to "actively" do something within seconds? Need → Don’t move yet.
3. Does it need to be connected to things in the LAN? Do → Don’t move yet.
4. If none of the above three conditions are met → then there is a high probability that it can run happily on the edge.

After asking three questions, there are actually more projects that can be passed than imagined. The things I’ve moved up over the past two years—image indexing, short links, a few webhook relays, an RSS cleaning service—add up to eliminating the need for a VPS and all the operations and maintenance it brings.

But none of those "always awake" things were moved. They are still in the closet, the fan is a bit noisy, and it restarts every two months, which is good.
