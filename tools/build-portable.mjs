// 把年糕桌宠打成 Windows 免安装便携版。
//
// 不需要任何打包工具（electron-packager / electron-builder 都不用）：Electron 的
// 发行版本质上就是「一个 electron.exe + 一堆 dll/pak + resources/」，只要把应用放进
// resources/app/，再把 electron.exe 改个名，它就是一份独立应用。
//
//   node tools/build-portable.mjs
//
// 产出：
//   dist/nianbao-pet/                      免安装目录（双击 nianbao-pet.exe）
//   dist/nianbao-pet-<version>-win-x64.zip  发给别人的那个包
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");
const DIST = join(APP, "dist");
const OUT = join(DIST, "nianbao-pet");
const ELECTRON_DIST = join(APP, "node_modules", "electron", "dist");
const EXE_NAME = "nianbao-pet.exe";

const pkg = JSON.parse(readFileSync(join(APP, "package.json"), "utf8"));

/** 只把这些带进包里；node_modules 不要（运行时不依赖它）。 */
const APP_FILES = ["main.js", "index.html", "package.json", "launch.vbs", "README.md", "assets"];

/** Electron 发行版里的构建残留，没必要带给别人。 */
const JUNK = ["debug.log", join("resources", "default_app.asar")];

function dirSize(target) {
  let total = 0;
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const full = join(target, entry.name);
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size;
  }
  return total;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const GUIDE = `年糕鲸鱼娘桌宠 —— 免安装版

怎么用
------
1. 把整个 nianbao-pet 文件夹解压出来（整个文件夹，不要只把里面的文件拖出来）
2. 双击 ${EXE_NAME} 就能起她

   双击没反应的话，改成双击 launch.vbs —— 它做的是一样的事，
   只是会先清掉一个会毒死 Electron 的环境变量。

3. 她默认出现在屏幕左下角，直接拖就能挪，拖到哪都行。
   鼠标不悬停在她身上时窗口是穿透的，不挡你点别的东西。

身上三个按钮
------------
  📚 科目      点开是科目清单，点一个就用资源管理器打开那个文件夹
  📅 日程      记日程和 deadline，快到期会弹 Windows 通知提醒
  📖 读书材料  挑一个文件夹，她把里面的文字截图一张张看过去，
               各取一个能用来检索的短名字，最后导出 _年糕索引.md

关于 📖 读书材料
----------------
这一步要调视觉模型，需要一个 DeepSeek API Key：
  * 点 📖 → 面板里粘一个 sk-... → 「保存 Key」
  * Key 只存在你自己电脑上（%APPDATA%\\nianbao-pet\\config.json），不会外传
  * 不需要这个功能的话，📚 和 📅 完全用不着 Key

数据存在哪
----------
  %APPDATA%\\nianbao-pet\\
    folders.json        科目清单
    calendar.json       日程 / deadline
    config.json         API Key
    reader-cache.json   读图结果缓存
    window-pos.json     她上次待的位置

想放桌面快捷方式
----------------
右键 launch.vbs → 发送到 → 桌面快捷方式，然后右键那个快捷方式改名、换图标即可。

许可证
------
MIT。内含的 Electron 运行时遵循它自己的 LICENSE（见同目录的 LICENSE 文件）。
`;

console.log(`打包年糕桌宠 v${pkg.version}`);

if (!existsSync(join(ELECTRON_DIST, "electron.exe"))) {
  console.error("找不到 node_modules/electron/dist/electron.exe —— 先在应用目录里跑一次 npm install");
  process.exit(1);
}

console.log("\n[1/4] 复制 Electron 运行时…");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(ELECTRON_DIST, OUT, { recursive: true });
for (const junk of JUNK) rmSync(join(OUT, junk), { recursive: true, force: true });

console.log("[2/4] 放入应用文件…");
const appDir = join(OUT, "resources", "app");
mkdirSync(appDir, { recursive: true });
for (const item of APP_FILES) {
  const from = join(APP, item);
  if (!existsSync(from)) {
    console.warn(`  跳过（不存在）：${item}`);
    continue;
  }
  cpSync(from, join(appDir, item), { recursive: true });
  console.log(`  + ${item}`);
}

console.log("[3/4] 改名 + 放启动器和说明…");
renameSync(join(OUT, "electron.exe"), join(OUT, EXE_NAME));
console.log(`  electron.exe -> ${EXE_NAME}`);
cpSync(join(APP, "launch.vbs"), join(OUT, "launch.vbs"));
// BOM 让记事本一定认得出是 UTF-8，中文不乱码
writeFileSync(join(OUT, "使用说明.txt"), "\uFEFF" + GUIDE.replace(/\n/g, "\r\n"), "utf8");

console.log("[4/4] 压缩…");
const zip = join(DIST, `nianbao-pet-${pkg.version}-win-x64.zip`);
rmSync(zip, { force: true });
execFileSync("powershell", [
  "-NoProfile", "-Command",
  `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
  `[System.IO.Compression.ZipFile]::CreateFromDirectory('${OUT}', '${zip}', ` +
  `[System.IO.Compression.CompressionLevel]::Optimal, $false)`
], { stdio: "inherit" });

console.log(`\n免安装目录 ${OUT}   ${mb(dirSize(OUT))}`);
console.log(`压缩包     ${zip}   ${mb(statSync(zip).size)}`);
