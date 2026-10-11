# 年糕鲸鱼娘桌宠

一个**无边框、透明、置顶**的 Windows 桌宠。她能待在屏幕任何地方，鼠标不悬停在她身上时
窗口完全穿透，不挡你点别的东西。身上三个按钮，都是给读书/科研用的：

| 按钮 | 干什么 |
| --- | --- |
| 📚 **科目** | 科目文件夹清单。点一个就用资源管理器打开它，不用再来回翻目录。 |
| 📅 **日程** | 记日程和 deadline。快到期她会在头顶气泡提醒你，同时弹一条 Windows 通知。 |
| 📖 **读书材料** | 挑一个文件夹，她把里面的**文字截图**一张张略读，各取一个能用来检索的短名字，最后导出一份 `_年糕索引.md`。 |

![截图](docs/screenshot.png)

---

## 下载就能用（Windows 10/11，64 位）

1. 到本仓库的 [**Releases**](../../releases) 页面
2. 下载 `nianbao-pet-1.0.0-win-x64.zip`（约 106 MB，内含 Electron 运行时，**不需要装 Node**）
3. **把整个文件夹解压出来**（别只往外拖文件）
4. 双击 `nianbao-pet.exe`

双击没反应的话，改成双击 `launch.vbs` —— 做的是同一件事，只是会先清掉一个会毒死
Electron 的环境变量。想放桌面快捷方式：右键 `launch.vbs` → 发送到 → 桌面快捷方式。

解压出来的文件夹里有 `使用说明.txt`，内容一样。

---

## 三个功能怎么用

### 📚 科目

点 📚 → 面板列出科目 → 点一个用资源管理器打开。维护方式：

- **＋ 添加科目**：开系统原生的选目录对话框，挑一个文件夹
- **⇊ 整批导入**：挑一个根目录，把它的一级子文件夹一次全加成科目
- **🗑**：从清单里移除（**不动硬盘上的文件夹**）
- 右键 📚 也能直接添加

### 📅 日程 / deadline

点 📅 → 填标题 + 日期（+ 时间 / 备注）→ 回车或点「＋ 加上」。

- 列表按日期排，显示 `明天` / `3 天后` / `逾期 2 天` 这样的角标
- ☐ 打勾完成、🗑 删除
- **快到期的高亮**：2 天内到期标黄，逾期标红
- **提醒**：启动时和之后每 5 分钟检查一次，未完成且 2 天内到期（含逾期）的会 → 头顶气泡
  说一句 + 弹一条系统通知。同一条每天只提醒一次
- 📅 按钮上的**红角标** = 有几条要到期了

### 📖 读书材料片段分析

用来把「论文里截图存下来的那些有价值的片段」变成能检索的东西。

1. 点 📖 → **选文件夹**
2. 她数一下里面有多少张图（png / jpg / webp / bmp / gif / tif）
3. **开始略读** → 一张张过：读文件 → 缩到长边 1600 → 交给视觉模型 → 拿到 `短名` + `一句话说明`
4. **导出索引.md** → 在**那个文件夹里**写出 `_年糕索引.md`（表格：短名 / 说明 / 原文件名）

实测效果（三张内容差别很大的截图）：

| 原文件 | 模型给的短名 | 说明 |
| --- | --- | --- |
| `shot-01.png` | 卷积神经网络基础结构 | 概述卷积层、池化层、全连接层的作用与参数分布特点 |
| `shot-02.png` | Verilog时序逻辑模板 | 展示Verilog异步复位D触发器模板，并说明非阻塞赋值与亚稳态 |
| `shot-03.png` | 模拟退火算法伪代码 | 展示初始化、邻域采样、Metropolis 接受准则与降温直至 Tmin |

![读图](docs/screenshot-reader.png)

这个功能需要网络和一个 **DeepSeek API Key**：

- 点 📖 → 面板里粘一个 `sk-...` → **保存 Key**
- Key 只存在你自己电脑上（`%APPDATA%\nianbao-pet\config.json`），不会外传
- **不需要这个功能的话，📚 和 📅 完全用不着 Key**
- 模型调用在应用的主进程里做，密钥不进渲染进程

`_年糕索引.md` 是给你检索用的，**原文件名不会改动**。

---

## 数据存在哪

全部在 `%APPDATA%\nianbao-pet\`：

| 文件 | 内容 |
| --- | --- |
| `folders.json` | 科目清单 |
| `calendar.json` | 日程 / deadline |
| `config.json` | API Key |
| `reader-cache.json` | 读图结果缓存（按 `路径\|大小\|修改时间`，没改过的图重跑直接命中） |
| `window-pos.json` | 她上次待的位置 |

删掉这个目录就是恢复出厂。

---

## 从源码跑

需要 Node.js 18+。

```sh
git clone https://github.com/lerongnovelmusic/nianbao-pet.git
cd nianbao-pet
npm install
npm start
```

**从别的 Electron/Node 进程里启动她时**，必须先清掉 `ELECTRON_RUN_AS_NODE`：

```powershell
$env:ELECTRON_RUN_AS_NODE = $null
& .\node_modules\electron\dist\electron.exe .
```

否则 Electron 会以**普通 Node** 身份启动：`require("electron")` 退化成路径字符串、
`ipcMain` 是 undefined、窗口开不出来，而且**静默退出 exit 0、零输出**。
`launch.vbs` 已经替你处理了这件事。

## 自己打包免安装版

不需要 electron-packager / electron-builder：

```sh
node tools/build-portable.mjs
```

产出 `dist/nianbao-pet/`（免安装目录）和 `dist/nianbao-pet-<版本>-win-x64.zip`。

原理很简单：Electron 的发行版本质上就是「一个 `electron.exe` + 一堆 dll/pak +
`resources/`」，把应用放进 `resources/app/`、再把 exe 改个名，它就是一份独立应用。

## 结构

```
nianbao-pet/
├─ main.js        主进程：透明置顶窗口、拖动、鼠标穿透、科目/日程/读图 IPC、
│                 系统通知、原生选目录、视觉模型调用（密钥留在这一侧）
├─ index.html     渲染进程：年糕 + 气泡 + 📚 科目 + 📅 日程 + 📖 读书材料（单文件，无构建）
├─ assets/
│  ├─ nianbao.png       原图 —— CSS 套 border-radius 当圆角卡片
│  ├─ nianbao-face.png  同一张，面板头像用
│  └─ nianbao.ico       桌面快捷方式图标（7 种尺寸）
├─ launch.vbs     直启器（UTF-16 LE，自定位，无控制台窗口）
├─ tools/
│  └─ build-portable.mjs  打免安装版
└─ docs/          截图
```

## 已知取舍

- **这是 Windows 应用**。`main.js` 里的窗口逻辑是跨平台的，但打包脚本和 `launch.vbs`
  是按 Windows 写的。
- **体积大**（解压 259 MB / 压缩 106 MB）——Electron 的运行时就是这样，没办法。
- **视觉模型是实验版**（`deepseek-v4-flash-vision-exp`）：偶尔只吐推理、正文为空，
  所以代码里做了一次重试；名字质量也没法像结构化输出那样保证，所以才用「严格两行约定
  + 拿不到就退回原文件名」兜底。
- **📖 一次最多处理 500 张图**，单个目录最多列 400 个子目录，科目清单最多 200 条。
- 界面文案是中文，没做多语言。

## 许可证

MIT。内含的 Electron 运行时遵循它自己的 LICENSE。
