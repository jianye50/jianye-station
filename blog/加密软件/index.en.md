---
title: "Simple and secure local file protection tool: Jianye File Encryptor Jianye File Encryptor"
desc: In the digital age, personal photos, private documents, and work-related confidential information are at risk of being leaked at any time. Many ordinary users want to protect files, but are daunted by complex cryptography. The threshold for command line encryption tools is too high, and commercial encryption...
tags: ["File encryption","encryption software","File security"]
date: 2026-10-17
minutes: 6
cover: 391.png
background: 391.png
lang: en
auto: true
srcHash: 7d11e84e867e05e2
translatedAt: 2026-10-30T13:48:23.786Z
---
In the digital age, personal photos, private documents, and work-related confidential information are at risk of being leaked at any time. Many ordinary users want to protect files, but are daunted by complex cryptography. The threshold for command-line encryption tools is too high, and commercial encryption software is bloated and complicated. **Jianye File Encryptor** is a local file encryption and decryption tool for ordinary users. It encapsulates military-grade encryption algorithms into a simple and easy-to-use graphical interface. No professional knowledge is required, and encryption can be completed by dragging and dropping files. It provides a lightweight file privacy protection solution for individuals and small teams.

![FoCnobLdHNSDkR6Y77fkqanhUFYt](FoCnobLdHNSDkR6Y77fkqanhUFYt.png)

## 1. Tool introduction: AES‑256 support, simplicity first
Jianye File Encryptor is a Windows platform GUI encryption software developed based on the **AES‑256‑CBC** symmetric encryption algorithm. It uses PyQt6 to build a graphical interactive interface. After the encryption is completed, an exclusive suffix `.jye` encrypted file will be generated. Only by entering the correct password can the original file be restored.

The software implements the design concept of "simple, safe and easy to use" and encapsulates all the underlying details of cryptography. Ordinary users do not need to understand the encryption principle and only need to set a password to complete file protection.
> ⚠️Important reminder: This tool **does not have a password retrieval function**. Once the password is forgotten, the encrypted `.jye` file will be completely unable to be opened. Be sure to keep the password properly.

### Core highlights features
1. **Drag-and-drop GUI interaction**: Supports dragging files directly to the window, you can also click to select files, the encryption and decryption progress is visually displayed, and the waiting process is clear at a glance;
2. **System theme automatic adaptation**: Automatically switch between light and dark modes following the Windows system, providing a comfortable visual experience;
3. **Complete Exception Tolerance**: Covers various abnormal scenarios such as incorrect passwords, insufficient permissions, damaged files, and program shutdown midway;
4. **Built-in original file name storage**: The original file name is embedded in the header of the encrypted file and is automatically restored during decryption, without the need for the user to manually modify the name;
5. **Large file friendly**: Using 64KB block read and write encryption, processing GB-level large files will not excessively occupy memory.

## 2. Core functions: more than encryption and decryption
In addition to the core file encryption and decryption, the software also comes with a number of practical auxiliary capabilities, taking into account both security and ease of use.

|Function module|Capability description|
| ---- | ---- |
|File Encryption|Enter the password to encrypt ordinary files into `.jye` files. The source files will be deleted successfully after encryption, and temporary files will be generated to avoid abnormal data loss|
|File decryption|Read the `.jye` file, enter the password to restore the original file, and remove the encrypted file after decryption is completed|
|Original file name extraction|Do not decrypt the file, only read the file header, and you can view the encrypted original file name|
|Encrypted file verification|Double check the extension and file header format to identify whether it is a legal .jye encrypted file|
|Auxiliary protection|File coverage confirmation, directory permission pre-check, window closing and safe task termination, automatic cleaning of temporary tmp files, memory window position size|

The overall software is divided into two major code modules: `crypto_utils.py` is responsible for encryption and decryption of the underlying cryptographic logic; `main.py` is responsible for the graphical interface, thread scheduling, and progress feedback. Encryption and decryption are all run in independent working threads, which will not cause the Windows interface to freeze.

## 3. Security bottom layer: follow cryptography best practices
Many self-made encryption tools have vulnerabilities such as insecure random numbers and too low number of iterations. Jianye Encryptor avoids many common pitfalls in its underlying design.

1. **Encryption algorithm AES-256-CBC**: 256-bit key strength, which is an industry-recognized high-security symmetric encryption standard;
2. **Key derivation PBKDF2‑HMAC‑SHA256**: Using 100000 iterations, with `os.urandom()`, the system truly randomly generates a 16-byte salt value and a 16-byte IV initialization vector. Even if two files are encrypted with the same password, the resulting ciphertext will be completely different, which greatly increases the cost of brute force cracking;
3. **PKCS7 standard filling**: adopt industry standard filling scheme to avoid filling Oracle-type security vulnerabilities;
4. **Memory security**: Passwords are only temporarily stored in memory, will not be written to disk or registry, and will be released promptly after use;
5. **Exception safe rollback**: If an error occurs during encryption and decryption, the program will be closed, and `.tmp` temporary files will be automatically cleaned, leaving no damaged semi-finished files; if decryption fails, incomplete output files will be automatically deleted to avoid junk files remaining on the disk.

### A brief overview of the encryption process
1. The user selects the file and enters the encryption password;
2. The program generates random salt values and random IVs;
3. PBKDF2 combines the user password with the salt value to derive the 32-byte AES key;
4. Write the salt, IV, and original file name into the `.jye` file header;
5. The original file is read in blocks and AES‑CBC encrypted and written to temporary `.tmp`;
6. After all encryption is completed, delete the original file and rename the temporary file to `.jye` encrypted file.

Reverse execution during decryption: read the file header to obtain the salt and IV, then use the user's password to derive the key, and decrypt the ciphertext in blocks. If the password is incorrect, the PKCS7 defill exception will be captured, prompting the password is incorrect, and will not crash directly.

## 4. Get started: protect your files in two steps
### File encryption
1. Open the software and drag the file that needs to be protected into the window, or click on the window to select the file;
2. Enter the encryption password and confirm; if the target `.jye` file already exists, a pop-up window will pop up asking whether to overwrite it;
3. Observe the progress bar and wait for completion; after completion, the source file is removed and the `.jye` suffix encrypted file is obtained.

### File decryption
1. Drag the `.jye` encrypted file into the software;
2. Enter the set password; if a file with the same name exists in the output location, confirm whether to overwrite it;
3. After the progress is completed, the software deletes the encrypted files and restores the original original files.

> Tips: The latest version supports directly double-clicking the `.jye` file to invoke the program, further simplifying the operation. The software will remember the last window size and position, so there is no need to repeatedly adjust the window each time it is opened.

## 5. Suitable usage scenarios
1. **Personal Privacy Protection**: Photos, diaries, and private documents are stored encrypted. When lending your computer to others, you don’t have to worry about your privacy being viewed;
2. **Office sensitive data**: Contracts, plans, and internal materials are stored encrypted and encrypted before transmission and copying to prevent leakage;
3. **Cross-device file transfer**: U disk copy and encryption before sending over the network. Even if the file is intercepted during transmission, the content cannot be read without a password;
4. **Temporary data protection**: The computer temporarily stores sensitive data, decrypts it after use, and remains encrypted when idle.

From the performance test, on an ordinary home computer: it takes about 1 second to encrypt and decrypt a 10MB small file; it only takes more than ten seconds to complete a 1GB large file, and the memory usage is maintained at tens of MB. The computer configuration requirements are very low, and ordinary home notebooks can run smoothly.

## 6. Objective view: Tool boundaries and precautions
1. **Only supports single file encryption**. Direct encryption of the entire folder is not yet supported. You can package and compress the folder first, and then encrypt the compressed package;
2. **Local offline encryption**, all operations are completed locally, and files will not be uploaded to any cloud; however, the password is completely kept by the user, and the software does not have any means to retrieve the password;
3. Encrypted `.jye` files can only be decrypted using this software. If the software is lost and the password is forgotten, the data will be permanently lost;
4. It is recommended to back up important files before encrypting them to prevent accidents.

## Write at the end
The greatest value of Jianye File Encryptor is to bring professional cryptography capabilities to ordinary users. Many people want to protect files, but are unwilling to learn complex cryptography knowledge. This software just fills this gap: the bottom layer strictly follows cryptography specifications, and the upper layer interaction is kept as simple as possible. If you have local file encryption needs and are looking for an offline, lightweight, and offline encryption solution, it is worth a try.

**[Official website](https://jianye.pages.dev/jye/)**
