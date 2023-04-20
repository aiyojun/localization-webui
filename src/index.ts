import { BrowserWindow, Menu, app, nativeImage, ipcMain } from 'electron'
import * as path from "path"
import * as fs from "fs"
import axios from "axios"

export const exec_main = () => {
    const argv = process.argv.slice(2)
    let configPath = path.join(__dirname, '../local.config.json')
    argv.forEach(arg => {
        if (arg.indexOf('--config=') !== -1) {
            configPath = arg.substring(9)
        }
    })

    const config = JSON.parse(fs.readFileSync(configPath).toString())

    let win

    const createWindow = () => {
        Menu.setApplicationMenu(null)
        win = new BrowserWindow({
            width: config.app.window.width,
            height: config.app.window.height,
            icon: config.project.icon,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js')
            }
        })
        win.loadFile(config.project.entry)
        if (config.app.maximize) {
            win.maximize()
        }
        if (config.app.openDevTools) {
            win.webContents.openDevTools()
        }
    }

    app.whenReady().then(() => {
        createWindow()
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow()
            }
        })
    })
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit()
        }
    })

    const proxy = config.server.host || ''
    const prefix = config.server.host.prefix || ''

    if (proxy !== '') {
        ipcMain.on('http', (e, [method, url, data]) => {
            url = url.replace(prefix, '')
            const handle = {
                GET : () => { axios.get(`${proxy}${url}`).then(resp => win.webContents.send('http', resp.data)).catch(error => win.webContents.send('http', {error})) },
                POST: () => { axios.post(`${proxy}${url}`, data).then(resp => win.webContents.send('http', resp.data)).catch(error => win.webContents.send('http', {error})) },
            }
            if (handle[method] !== undefined) {
                handle[method]()
            }
        })
    }

    console.info(`[App] Web UI Localization`)
    console.info(`[App] Web project: ${config.project.entry}`)
}

exec_main()