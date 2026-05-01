# 30·30 Helper

每 30 分钟提醒看窗外半秒，每 60 分钟提醒起身喝水活动。Apple 极简风格，sage green accent。

## 运行

```bash
npm install
npm start
```

## 打包成单 exe

```bash
npm run build
```

输出在 `dist/` 目录，是一个免安装的 portable .exe，双击即用。

## 用法

早上开始工作时打开应用，点 **开始**。窗口可以最小化，托盘里继续运行。
- 每 30 min → 系统通知「看一眼窗外」
- 每 60 min → 系统通知「起来动一下」

## 调试 / 测试

想立刻看到通知效果，把 `renderer.js` 顶部两个常量临时改小：

```js
const EYE_INTERVAL = 10;   // 10 秒看窗外
const MOVE_INTERVAL = 20;  // 20 秒活动
```

记得测完改回 `30 * 60` 和 `60 * 60`。

## 文件结构

```
main.js       Electron 主进程 + 系统通知
preload.js    安全的 IPC 桥
index.html    UI 结构
styles.css    Apple 极简样式
renderer.js   计时器状态机
```
