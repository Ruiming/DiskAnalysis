const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
let mainWindow = null;


// 若所有窗口关闭，则退出
app.on('window-all-closed', () => {
    if(process.platform != 'darwin') {
        app.quit();
    }
});

app.on('ready', () => {
    // 创建浏览器窗口
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        minWidth: 550,
        title: "硬盘分析",
        center: true
    });
    // 加载应用的index.html
    mainWindow.loadURL('file://' + __dirname + '/index.html');

    // 打开开发工具
    mainWindow.openDevTools();

    // 当window被关闭，触发下面事件
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

});
