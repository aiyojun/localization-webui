import { BrowserWindow, Menu, app} from 'electron'

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    const win = new BrowserWindow({
        width: 800, height: 600,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: 'rgba(43,45,48,1)',
            symbolColor: '#bbb',
            height: 40
        },
        webPreferences: {
            webSecurity: false
        }
    })
    win.loadFile('../loading.html').then(_ => {
        win.loadURL('http://127.0.0.1:8000/product/vision/login').then(_ => {
            win.webContents.openDevTools()
        }).catch(_ => {
            win.loadFile('../404.html')
        })
    })
})
