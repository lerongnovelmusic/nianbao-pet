// 年糕鲸鱼娘桌宠 —— 一个独立的 Electron 应用。
//
// 为什么年糕要单独有一个应用：网页里的元素出不了自己的窗口，所以「能出现在屏幕
// 任何地方」只能由一个无边框、透明、置顶的独立窗口来做。DSH 那边的
// whale-folders 插件负责把这扇窗口拉起来/收回，两边通过同一个 folders.json
// 共用科目清单。
//
// 这个应用是自包含的：不依赖 DSH、不依赖别的仓库，单独 `npm start` 也能跑。
// DSH 只是「可以帮你启动它」而已。
const { app, BrowserWindow, ipcMain, screen, dialog, shell, Notification } = require("electron");
const fs = require("fs");
const path = require("path");

let win = null;
let dragState = null;

/** 窗口图标（只影响系统对话框，窗口本身无边框）。 */
const APP_ICON = path.join(__dirname, "assets", "nianbao-face.png");

/** 默认宽度；高度由渲染进程按内容算出来，经 resize 频道同步过来。 */
const WIN_WIDTH = 320;

/* ------------------------------------------------------------------ *
 * 科目清单：和 DSH 插件共用同一个文件
 * ------------------------------------------------------------------ */

/**
 * 清单文件的位置。
 *
 * 优先级：显式环境变量 > DSH_HOME 下的约定路径 > 自己的 userData。
 * 由 DSH 插件拉起时，插件会用 WHALE_FOLDERS_FILE 明确指过来，保证两边看同一份。
 */
function foldersFile() {
  if (process.env.WHALE_FOLDERS_FILE) return process.env.WHALE_FOLDERS_FILE;
  if (process.env.DSH_HOME) {
    return path.join(process.env.DSH_HOME, "storages", "whale-folders", "folders.json");
  }
  return path.join(app.getPath("userData"), "folders.json");
}

/** 中文按拼音排，和插件那边的 Intl.Collator 同一套规则。 */
const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });

function isDir(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch (error) {
    return false;
  }
}

function readFolders() {
  try {
    const parsed = JSON.parse(fs.readFileSync(foldersFile(), "utf8"));
    const list = Array.isArray(parsed) ? parsed : parsed && parsed.folders;
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && typeof item.path === "string" && item.path.trim() !== "")
      .slice(0, 200)
      .map((item, index) => ({
        id: typeof item.id === "string" && item.id !== "" ? item.id : `f${index + 1}`,
        name: typeof item.name === "string" && item.name.trim() !== "" ? item.name.trim() : item.path,
        path: item.path.trim()
      }));
  } catch (error) {
    // 文件不存在或坏了都当作空清单，绝不能因此起不来。
    return [];
  }
}

function writeFolders(raw) {
  const list = (Array.isArray(raw) ? raw : [])
    .filter((item) => item && typeof item.path === "string" && item.path.trim() !== "")
    .slice(0, 200)
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id !== "" ? item.id : `f${index + 1}`,
      name: (typeof item.name === "string" && item.name.trim() !== "" ? item.name.trim() : item.path).slice(0, 120),
      path: item.path.trim().slice(0, 1024)
    }));
  const file = foldersFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, folders: list }, null, 2), "utf8");
  return list;
}

/* ------------------------------------------------------------------ *
 * 窗口位置记忆
 * ------------------------------------------------------------------ */

function defaultPosition() {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: area.x + 28,
    y: area.y + Math.round(area.height * 0.34)
  };
}

function clampToScreen(x, y) {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.min(Math.max(x, area.x), area.x + area.width - 80),
    y: Math.min(Math.max(y, area.y), area.y + area.height - 80)
  };
}

function loadPosition() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "window-pos.json"), "utf8"));
    if (typeof raw.x === "number" && typeof raw.y === "number") return clampToScreen(raw.x, raw.y);
  } catch (error) {
    /* 第一次跑，或者文件读不了 */
  }
  return defaultPosition();
}

function savePosition() {
  if (!win) return;
  const [x, y] = win.getPosition();
  try {
    fs.writeFileSync(path.join(app.getPath("userData"), "window-pos.json"), JSON.stringify({ x, y }));
  } catch (error) {
    /* 位置记不住不影响使用 */
  }
}

/* ------------------------------------------------------------------ *
 * 窗口
 * ------------------------------------------------------------------ */

function createWindow() {
  const pos = loadPosition();
  win = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: WIN_WIDTH,
    height: 420,
    icon: APP_ICON,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  win.setAlwaysOnTop(true, "screen-saver");
  // 透明的地方鼠标穿透：只有悬停到年糕/按钮/面板上时才接管点击。
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile("index.html");
  win.on("closed", () => { win = null; });
}

ipcMain.on("ignore-mouse", (_event, ignore) => {
  if (win) win.setIgnoreMouseEvents(!!ignore, { forward: true });
});

ipcMain.on("quit", () => app.quit());

ipcMain.on("drag-start", (_event, { x, y }) => {
  if (!win) return;
  const [wx, wy] = win.getPosition();
  dragState = { x, y, wx, wy };
});

ipcMain.on("drag-move", (_event, { x, y }) => {
  if (!dragState || !win) return;
  const next = clampToScreen(dragState.wx + (x - dragState.x), dragState.wy + (y - dragState.y));
  win.setPosition(next.x, next.y);
});

ipcMain.on("drag-end", () => {
  dragState = null;
  savePosition();
});

ipcMain.on("resize", (_event, { w, h }) => {
  if (!win) return;
  win.setSize(
    Math.max(WIN_WIDTH, Math.round(w || WIN_WIDTH)),
    Math.max(180, Math.min(900, Math.round(h || 420)))
  );
});

/* ------------------------------------------------------------------ *
 * 科目清单 / 打开文件夹
 * ------------------------------------------------------------------ */

ipcMain.handle("folders-get", () => ({
  ok: true,
  folders: readFolders().map((folder) => ({ ...folder, exists: isDir(folder.path) })),
  file: foldersFile()
}));

ipcMain.handle("folders-set", (_event, list) => {
  try {
    return { ok: true, folders: writeFolders(list) };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
});

/** 列一个目录下的子目录，给「整批导入」用。 */
ipcMain.handle("subdirs", (_event, dir) => {
  const target = String(dir || "").trim();
  if (target === "") return { ok: false, error: "没给目录" };
  if (!isDir(target)) return { ok: false, error: "路径不存在或不是文件夹" };
  try {
    const dirs = [];
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      dirs.push({ name: entry.name, path: path.join(target, entry.name) });
      if (dirs.length >= 400) break;
    }
    dirs.sort((a, b) => collator.compare(a.name, b.name));
    return { ok: true, dirs, path: target };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
});

/** 用系统原生的选目录对话框挑一个文件夹。 */
ipcMain.handle("pick-dir", async (_event, current) => {
  const start = current && isDir(current) ? current : undefined;
  const result = await dialog.showOpenDialog(win, {
    title: "选一个文件夹",
    defaultPath: start,
    properties: ["openDirectory"]
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
});

/** 校验后再交给系统打开，这样界面能拿到具体原因。 */
ipcMain.handle("open-dir", async (_event, dir) => {
  const target = String(dir || "").trim();
  if (target === "") return { ok: false, error: "还没设定文件夹" };
  if (!isDir(target)) return { ok: false, error: "路径不存在或不是文件夹" };
  const message = await shell.openPath(target); // 成功时返回空字符串
  return message ? { ok: false, error: message } : { ok: true };
});

/* ------------------------------------------------------------------ *
 * 日程 / deadline：和科目清单放在同一个目录
 * ------------------------------------------------------------------ */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** 和 folders.json 并排，共用同一份存储位置。 */
function calendarFile() {
  return path.join(path.dirname(foldersFile()), "calendar.json");
}

function readEvents() {
  try {
    const parsed = JSON.parse(fs.readFileSync(calendarFile(), "utf8"));
    const list = Array.isArray(parsed) ? parsed : parsed && parsed.events;
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && typeof item.title === "string" && DATE_RE.test(String(item.date || "")))
      .slice(0, 500)
      .map((item, index) => ({
        id: typeof item.id === "string" && item.id !== "" ? item.id : `e${index + 1}`,
        title: item.title.trim().slice(0, 160),
        date: String(item.date),
        time: TIME_RE.test(String(item.time || "")) ? String(item.time) : "",
        note: typeof item.note === "string" ? item.note.trim().slice(0, 500) : "",
        done: item.done === true
      }));
  } catch (error) {
    // 没有文件或文件坏了都当作空日程，绝不能因此起不来。
    return [];
  }
}

function writeEvents(raw) {
  const list = (Array.isArray(raw) ? raw : [])
    .filter((item) => item && typeof item.title === "string" && item.title.trim() !== ""
      && DATE_RE.test(String(item.date || "")))
    .slice(0, 500)
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id !== "" ? item.id : `e${index + 1}`,
      title: item.title.trim().slice(0, 160),
      date: String(item.date),
      time: TIME_RE.test(String(item.time || "")) ? String(item.time) : "",
      note: typeof item.note === "string" ? item.note.trim().slice(0, 500) : "",
      done: item.done === true
    }));
  const file = calendarFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, events: list }, null, 2), "utf8");
  return list;
}

ipcMain.handle("calendar-get", () => ({ ok: true, events: readEvents(), file: calendarFile() }));

ipcMain.handle("calendar-set", (_event, list) => {
  try {
    return { ok: true, events: writeEvents(list) };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
});

/** 系统级提醒：弹一条 Windows 通知（右下角那种）。 */
ipcMain.handle("notify", (_event, payload) => {
  const title = String((payload && payload.title) || "年糕提醒").slice(0, 120);
  const body = String((payload && payload.body) || "").slice(0, 400);
  try {
    if (!Notification.isSupported()) return { ok: false, error: "系统不支持通知" };
    new Notification({ title, body, icon: APP_ICON, silent: false }).show();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
});

/* ------------------------------------------------------------------ *
 * 读书材料片段分析：扫图 → 让视觉模型略读 → 取个短名字
 * ------------------------------------------------------------------ */

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"]);
const IMAGE_MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".bmp": "image/bmp", ".gif": "image/gif", ".tif": "image/tiff", ".tiff": "image/tiff"
};

/** 让模型只吐两行，好解析。 */
const READER_PROMPT = [
  "这是从读书材料里截下来的一张图（论文、课件、笔记都有可能）。请做两件事：",
  "1. 给它起一个可以用来检索的短名字，不超过 12 个汉字，要具体，别用「图片」「内容」这种泛称；",
  "2. 用一句话说明它讲了什么，不超过 40 字。",
  "严格只输出两行：第一行是名字，第二行是说明。不要编号、不要 markdown、不要客套。"
].join("\n");

function configFile() {
  return path.join(app.getPath("userData"), "config.json");
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), "utf8"));
  } catch (error) {
    return {};
  }
}

function writeConfig(patch) {
  const next = Object.assign(readConfig(), patch);
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

ipcMain.handle("key-status", () => {
  const key = String(readConfig().apiKey || "");
  return {
    ok: true,
    has: key.length > 0,
    tail: key.length > 4 ? key.slice(-4) : "",
    // 「从 DSH 取 Key」只在真的装了 DSH 的机器上才有意义，界面上据此决定要不要显示
    canFromDsh: fs.existsSync(dshCredentialsFile())
  };
});

ipcMain.handle("key-set", (_event, key) => {
  try {
    writeConfig({ apiKey: String(key || "").trim() });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
});

/** DSH 存 DeepSeek Key 的地方。 */
function dshCredentialsFile() {
  const home = process.env.DSH_HOME || path.join(app.getPath("home"), ".dsh");
  return path.join(home, ".credentials.yaml");
}

/**
 * 从 DSH 的凭证库里取 Key，省得再粘一遍。
 *
 * DSH 把它存在 $DSH_HOME/.credentials.yaml 里，形如 `DEEPSEEK_API_KEY: sk-…`。
 * 只在用户明确点这个按钮时才读，不做隐式兜底。没装 DSH 的机器上界面上不会显示这个按钮。
 */
ipcMain.handle("key-from-dsh", () => {
  const file = dshCredentialsFile();
  try {
    const text = fs.readFileSync(file, "utf8");
    const match = text.match(/^\s*DEEPSEEK_API_KEY\s*:\s*([^\s#]+)\s*$/m);
    if (!match) return { ok: false, error: ".credentials.yaml 里没找到 DEEPSEEK_API_KEY" };
    const key = match[1].replace(/^["']|["']$/g, "");
    if (key.length < 8) return { ok: false, error: "取到的 Key 看着不像有效值" };
    writeConfig({ apiKey: key });
    return { ok: true, tail: key.slice(-4) };
  } catch (error) {
    return { ok: false, error: "读不了 " + file + "：" + String((error && error.message) || error) };
  }
});

/** 列一个文件夹里的图片。 */
ipcMain.handle("reader-scan", (_event, dir) => {
  const target = String(dir || "").trim();
  if (!isDir(target)) return { ok: false, error: "路径不存在或不是文件夹" };
  try {
    const files = [];
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXT.has(ext)) continue;
      const full = path.join(target, entry.name);
      const stat = fs.statSync(full);
      files.push({ name: entry.name, path: full, size: stat.size, mtime: Math.round(stat.mtimeMs) });
      if (files.length >= 500) break;
    }
    files.sort((a, b) => collator.compare(a.name, b.name));
    return { ok: true, dir: target, files };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
});

/** 读一张图，回 data URL 给渲染进程去缩。 */
ipcMain.handle("reader-read", (_event, file) => {
  const target = String(file || "").trim();
  try {
    const ext = path.extname(target).toLowerCase();
    const bytes = fs.readFileSync(target);
    return {
      ok: true,
      dataUrl: "data:" + (IMAGE_MIME[ext] || "application/octet-stream") + ";base64," + bytes.toString("base64")
    };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
});

ipcMain.handle("reader-cache-get", () => {
  try {
    return { ok: true, cache: JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "reader-cache.json"), "utf8")) };
  } catch (error) {
    return { ok: true, cache: {} };
  }
});

ipcMain.handle("reader-cache-set", (_event, cache) => {
  try {
    fs.writeFileSync(path.join(app.getPath("userData"), "reader-cache.json"), JSON.stringify(cache || {}, null, 2), "utf8");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
});

/** 一次视觉调用。密钥留在主进程，不进渲染进程，也没有跨域问题。 */
ipcMain.handle("reader-analyze", async (_event, payload) => {
  const key = String(readConfig().apiKey || "").trim();
  if (key === "") return { ok: false, error: "no-key" };
  const dataUrl = String((payload && payload.dataUrl) || "");
  if (!dataUrl.startsWith("data:image/")) return { ok: false, error: "没有图片数据" };

  let lastError = "未知错误";
  // 这个实验版视觉模型偶尔会只吐推理、content 为空，重试一次基本就好了。
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({
          model: "deepseek-v4-flash-vision-exp",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: READER_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } }
            ]
          }],
          // 给足余量：这类模型可能先花 token 推理，再吐正文
          max_tokens: 800,
          stream: false
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        lastError = "http-" + response.status;
        if (response.status === 401 || response.status === 402) break; // 重试也没用
        continue;
      }
      const body = await response.json();
      const choice = body && body.choices && body.choices[0];
      const text = choice && choice.message && choice.message.content;
      if (text) return { ok: true, text: String(text).trim() };
      lastError = "模型没返回正文（finish_reason=" + ((choice && choice.finish_reason) || "?") + "）";
    } catch (error) {
      lastError = error && error.name === "AbortError"
        ? "超时（60 秒）"
        : String((error && error.message) || error);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: lastError };
});

/** 把结果写成一份 markdown 索引，放在被读的那个文件夹里。 */
ipcMain.handle("reader-write-index", (_event, payload) => {
  const dir = String((payload && payload.dir) || "").trim();
  const entries = Array.isArray(payload && payload.entries) ? payload.entries : [];
  if (!isDir(dir)) return { ok: false, error: "文件夹不存在了" };
  const lines = [
    "# 年糕读图索引",
    "",
    "由 nianbao-pet 的「读书材料片段分析」生成。短名和说明都由视觉模型读图后给出，",
    "用来检索这些片段；原文件名保持不变。",
    "",
    `共 ${entries.length} 条。`,
    "",
    "| 短名 | 说明 | 文件 |",
    "| --- | --- | --- |",
    ...entries.map((item) => {
      const title = String(item.name || "").replace(/\|/g, "\\|");
      const note = String(item.note || "").replace(/\|/g, "\\|");
      const file = String(item.file || "").replace(/\|/g, "\\|");
      return `| ${title} | ${note} | \`${file}\` |`;
    }),
    ""
  ];
  const target = path.join(dir, "_年糕索引.md");
  try {
    fs.writeFileSync(target, lines.join("\n"), "utf8");
    return { ok: true, file: target };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
});

/* ------------------------------------------------------------------ *
 * 单实例：重复启动就把已有那只带到前面，不叠第二只
 * ------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
