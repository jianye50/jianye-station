---
title: "Appraisal file transfer: web version of P2P peer-to-peer file transfer tool｜No need to download, open the web page and transfer files directly"
desc: "When transferring files between computers and mobile phones, you will always encounter various pain points: social software has strict..."
tags: ["file transfer","transmission"]
date: 2026-10-17
minutes: 6
cover: 1745762721370.jpg
background: 1745762721370.jpg
lang: en
auto: true
srcHash: e2502954877d6e86
translatedAt: 2026-10-30T13:48:27.900Z
---
> Project address: https://jianye.pages.dev/drop

When transferring files between computers and mobile phones, you will always encounter various pain points: social software has strict file size limits, and large files are uploaded and downloaded slowly; network disks need to be registered and logged in, and you have to go through two processes of uploading and downloading; various transfer tools require the installation of clients, and compatibility between different systems is poor; there are also many online transfer services, and files will pass through the servers of third-party service providers, which poses the risk of privacy leakage.

![屏幕截图_17-10-2026_134242_jianye.pages.dev](屏幕截图_17-10-2026_134242_jianye.pages.dev.jpg)

I developed **Jianye File Transfer**, a web page peer-to-peer file transfer tool deployed on the website. Based on WebRTC technology, the device is directly connected. **File content will not be transferred through the server**. Just open the browser and visit my website address to use it directly. There is no need to download any software or register an account. File transfer can be completed in both local area network and external network environments.

## ✨ Core Function Highlights
### 🔒 Point-to-point direct connection to ensure file privacy and security
Identification file transfer relies on WebRTC technology to establish a data channel between devices.
> Only a small amount of signaling information for device handshake pairing will be relayed. **All your file data, such as pictures, documents, videos, and compressed packages, will be transferred directly between the sending device and the receiving device and will not be uploaded and stored to the website's back-end server**.

After the two devices successfully establish a P2P connection, the files are only transferred between the devices at both ends. There is no need to worry about the file content being obtained by a third party, which protects the privacy of your data.

### 📱 Available in all platform browsers, zero client
There is no need to download the App or install the software. You can use any modern browser by accessing the website address:
- Computer: Windows, Mac, Linux, supports Chrome, Edge, Firefox, Safari
- Mobile terminal: Android phone, iPhone, iPad, can be accessed using the system's own browser or a third-party browser

Devices with different systems at home and in the office can send and receive files to each other as long as they can open web pages.

### 🎫 Room code quick pairing device
The room code mechanism is used to complete multi-device pairing, and the operation is simple and easy to understand:
1. Open the website, and the page will automatically generate an exclusive room code (format example `ABC‑123`);
2. Access the same website from other devices and enter the exact same room code;
3. The devices automatically discover each other, complete the connection, and then start transferring files.

The website also supports generating invitation links and QR codes: copy the invitation link and send it to others, and when the other party clicks on the link, the room code will be automatically filled in without manual input; the QR code can be brought up by hovering the button with the mouse, and scan the code to join the room directly.

A single room supports up to 8 devices online at the same time, and all devices in the room can send files to each other.

### 📤 Smooth file transfer experience
Provides two operation methods for sending files:
1. Click the device avatar circle on the page to bring up the file selection pop-up window and select the file to be sent;
2. Directly drag the local file to the target device avatar and start the transfer immediately.

Supports sending multiple files in batches, automatically fragments large files, and has built-in **breakpoint resume capability**. If you encounter network fluctuations or the connection is accidentally disconnected, after re-establishing the connection, you can continue to transfer from the position where the reception has been completed. Large files of hundreds of megabytes do not need to be resent.

The transfer process displays the progress percentage, real-time transfer speed, and estimated remaining time in real time; all transfer records are saved locally in the browser, and the records will not disappear when the web page is refreshed. When you receive a file, you can save it to your computer with one click. You can also turn on the notification sound, and the notification sound will automatically play when you receive a new file.

### 🎨 Rich interface customization capabilities
- **Display Theme**: Automatically switch with the system, light mode, dark mode, three modes available;
- **Personalized color matching**: Provides 8 sets of theme colors, modify the web interface and device avatar colors;
- **Multi-language**: Built-in 19 commonly used languages around the world, including Simplified Chinese, Traditional Chinese, English, Japanese, Korean, French, German, Arabic, etc., and will automatically recognize the browser system language;
- **Multi-language typesetting adaptation**: Perfectly supports Arabic and other languages written from right to left;
- **Mobile Adaptation**: When accessing the website on a mobile phone, it automatically switches to a vertical screen single-column layout, which is touch-friendly.

## 🛠️ Brief introduction to technology
The entire program is deployed on the website server, and all page resources can be loaded by accessing the URL.
1. **Signaling Negotiation**: Use PeerJS to complete handshake negotiation between devices, automatically switch multiple CDN sources, and automatically retry when the network is poor;
2. **WebRTC DataChannel**: Use data channels to complete binary file segmentation transmission without occupying audio and video channels;
3. **Front-end offline QR code generation**: All QR codes are generated locally by the browser, and no external online QR code interface is called;
4. **Browser local storage**: Room codes, custom device names, theme colors, and transmission history are all saved locally in the browser, and the server will not save your personal configuration;
5. **Heartbeat Online Detection**: Automatically identify the online status of the device. When the mobile phone is switched to the background or the webpage is frozen and dormant by the system, it can automatically identify the device and exit the room;
6. **Customized transmission protocol**: implements a complete set of file interaction logic for fragmented sending, breakpoint resuming, transmission cancellation, and failure retry.

> Tips: In some complex external NAT network environments, when the P2P direct connection cannot be established, only the handshake signaling is relayed, and the file data will still not pass through the server.

## 📖 Tutorial
1. Open my website in your device browser to access the appraisal document transfer page;
2. Click the "Random" button to generate a new room code, or you can manually enter the room code and set the device name displayed on the machine;
3. Open the same website on another device and fill in the same room code;
4. The page identifies other devices online;
5. Click on the other party’s device avatar to select the file, or directly drag the file to the avatar to send;
6. The recipient clicks Save in the transmission record column to download and save the file to his or her device.

> Tips: Copy the invitation link on the page and send it to your friends, or scan the QR code. The other party will automatically join the room when they open the link, eliminating the need to manually enter the room code.

## 📝 Suitable for these usage scenarios
1. Transfer large files such as videos and compressed packages between computers and mobile phones without being limited by the size of social software;
2. When transferring files in an intranet LAN environment, it is hoped that the files will not go to the public server and pay attention to privacy;
3. Cross-system device transfer: Windows ↔ iPhone, Android ↔ Mac;
4. Temporarily send files to colleagues and friends around you, and do not want to log in to various network disk accounts;
5. In a disconnected LAN environment, data can be transferred in batches between multiple devices.

## ⚠️ Precautions for use
1. The web version is based on the browser WebRTC. **The web page tab must be kept open during the transmission process. Closing the web page will interrupt the transmission**;
2. Some corporate intranets and strict firewalls will intercept WebRTC connections, causing the device to be unable to establish a P2P channel;
3. The transmission history is stored locally in the browser. Clearing the browser cache data will clear the record;
4. A single room can accommodate up to 8 devices. When full, some devices need to be exited before new devices can enter the room.

## 🎯Write at the end
Many file transfer services on the market either force files to be uploaded to the service provider's server or require the download of a bloated client. Jianye file transfer pursues lightweight. You only need to access the website to use it. File data is transmitted point-to-point directly as much as possible. Your file data only stays on your own device**.

If you often need to move files back and forth between multiple devices, you can save website links to browser bookmarks and open web pages anytime and anywhere to complete file transfers between devices.
