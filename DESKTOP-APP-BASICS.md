# Desktop App Essentials — What You Need to Know

This is your first desktop app. This file explains the **important ideas** in simple words, using **RentalCar CRM** as the example.

---

## 1. Website vs Desktop App

| | Website / SaaS | Desktop app (yours) |
|--|----------------|---------------------|
| Where it runs | Browser (Chrome, etc.) | Its own window on Windows |
| How you open it | Type a URL | Click an icon |
| Internet | Usually required | Works offline |
| Data | On a company server | On **your PC** |
| Install | No install | Install once with Setup `.exe` |

Your CRM is a **desktop application**: installed on the computer, opened like WhatsApp Desktop or Word.

---

## 2. The 3 files you care about

### A) Source code (for development)
Folder: `C:\Users\Chouiba\Desktop\CRM`

This is where the project is written (React UI + Electron + database code).  
You only need this folder when you want to **change** the app or rebuild it.

### B) Installer (for installing on a PC)
File: `release\RentalCarCRM-Setup-1.0.0.exe`

This is like downloading software from the internet:
1. Double-click Setup
2. Next → Next → Install
3. Windows creates a **Desktop icon** + **Start Menu** entry
4. You open the app by clicking the icon

### C) Installed app (after install)
Usually somewhere like:
`C:\Users\<YourName>\AppData\Local\Programs\RentalCar CRM\`

You don’t edit this. Windows runs it when you click the icon.

---

## 3. How a desktop app is structured (simple)

Your app has **2 parts** inside one window:

```text
┌─────────────────────────────────────┐
│  Electron (the desktop shell)       │
│  - creates the window               │
│  - talks to Windows                 │
│  - saves files / database           │
│                                     │
│   ┌─────────────────────────────┐   │
│   │  React UI (what you see)    │   │
│   │  buttons, tables, forms     │   │
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

- **UI (React)** = screens (Cars, Clients, Contracts…)
- **Electron** = makes it a real Windows app (window, icon, install)
- **SQLite database** = where cars/clients/contracts are stored as a file

You don’t need a website server. Everything runs on the PC.

---

## 4. Where your data is saved

Important: **installing the app ≠ storing business data in the same place**.

- App program files → installation folder  
- Your business data → a separate user folder (AppData)

For this project, data is roughly here:

```text
%APPDATA%\rental-car-crm\rentalcar.sqlite
```

That `.sqlite` file is your database (cars, clients, contracts, payments).

### What this means
- Uninstalling the app may remove the program, but you should still **back up** the database file.
- Copying only the Setup `.exe` to another PC installs an **empty** app (no old clients/cars), unless you also copy the database.
- Backup = copy `rentalcar.sqlite` (and keep it safe).

---

## 5. Dev mode vs Installed mode

### Dev mode (`npm run dev`)
- For you (the developer)
- Opens from source code
- Good for testing changes
- Not how clients should use the app

### Installed mode (Setup `.exe`)
- For real use on a PC
- Icon on desktop
- Feels like a normal Windows program
- This is what you want day-to-day

Rule of thumb:
- **Build/change code** → use project folder + `npm run dev`
- **Use the CRM for work** → install with Setup `.exe`

---

## 6. The normal lifecycle of your app

```text
1. Write / change code
2. Test with: npm run dev
3. Build installer: npm run dist
4. Get file: release\RentalCarCRM-Setup-1.0.0.exe
5. Install on PC(s)
6. Users click desktop icon every day
7. When you improve the app → rebuild Setup → install new version
```

---

## 7. Commands you should remember

Open terminal in the project folder (`CRM`), then:

```bash
npm install
```
Installs libraries (only needed when setting up or after dependency changes).

```bash
npm run dev
```
Runs the app in development (for testing).

```bash
npm run dist
```
Builds the Windows installer in the `release` folder.

---

## 8. What is Node.js / npm? (very short)

- **Node.js** = runtime that lets JavaScript tools run on your PC
- **npm** = package manager (downloads libraries your app needs)

You installed dependencies once with `npm install`.  
Your users who only install the `.exe` do **not** need Node.js.

---

## 9. French + Arabic in the app

The app is one program with two languages.

- Button **FR** / **ع** changes the interface language
- Data (names, plates, amounts) stays the same
- Language preference is saved on the PC

RTL (right-to-left) is used automatically for Arabic.

---

## 10. Security / Windows warning

When you open your Setup file, Windows may say:

> “Windows protected your PC”

This is common for new apps **without a paid code-signing certificate**.

For your own app on your PC:
1. Click **More info**
2. Click **Run anyway**

Later, if you sell/distribute widely, you can buy a certificate so Windows trusts it automatically.

---

## 11. One PC vs many PCs

### One PC (your current design)
- Perfect for a small agency
- Data stays on that computer
- Simple and offline

### Many PCs / many users later
Needs extra work (shared database, server, sync, accounts…).  
That becomes more like SaaS / networked software.  
Not required for v1.

---

## 12. What you can change later (roadmap mindset)

Easy next improvements:
- Better company logo/icon
- PDF contract print
- Backup button inside Settings
- More reports

Bigger changes:
- Multi-user login
- Cloud sync
- Mobile version

Start simple. Your current app already covers the core rental workflow.

---

## 13. Mental model (remember this)

1. **Setup `.exe`** = install the program  
2. **Desktop icon** = open the program  
3. **SQLite file** = your real business data  
4. **Project folder** = source code to improve the app  
5. **`npm run dist`** = create a new installer after changes  

If you understand those 5 points, you understand the essentials of this desktop CRM.

---

## 14. Quick FAQ

**Do my clients need internet?**  
No, not for the basic app.

**If I copy the project folder to another PC, is the app installed?**  
No. That is source code. Use the Setup `.exe` to install.

**If I delete the project folder, does the installed app break?**  
No. Installed app is separate. Keep the Setup file and database backup.

**Where do I double-click to install?**  
`C:\Users\Chouiba\Desktop\CRM\release\RentalCarCRM-Setup-1.0.0.exe`

**How do I open it after install?**  
Desktop icon **RentalCar CRM**, or Start Menu search.

---

## 15. Your practical checklist

- [ ] Install with `RentalCarCRM-Setup-1.0.0.exe`
- [ ] Confirm desktop icon exists
- [ ] Open app and switch FR / ع
- [ ] Add a car + client + contract
- [ ] Copy `rentalcar.sqlite` somewhere safe (backup)
- [ ] When you want updates later: change code → `npm run dist` → install new Setup

That’s all you need to know to start confidently.
