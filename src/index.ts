import { BrowserWindow, Menu, app, nativeImage, ipcMain, protocol, session } from 'electron'
import * as path from "path"
import * as fs from "fs"
import axios from "axios"
import {invoke} from "./git/git.runtime";


process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

export const exec_main = () => {
    const argv = process.argv.slice(2)
    let configPath = path.join(__dirname, '../local.config.json')
    argv.forEach(arg => {
        if (arg.indexOf('--config=') !== -1) {
            configPath = arg.substring(9)
        }
    })

    const config = JSON.parse(fs.readFileSync(configPath).toString())
    let appPath = path.dirname(app.getAppPath())
    // console.info(`app path : ${app.getAppPath()}`)
    console.info(`app dirname : ${appPath}`)
    console.info(`sessionData : ${app.getPath('sessionData')}`)



    let win

    const createWindow = () => {
        Menu.setApplicationMenu(null)
        win = new BrowserWindow({
            width: config.app.window.width,
            height: config.app.window.height,
            icon: config.project.icon,
            titleBarStyle: config.app.frame.titleBarStyle,
            titleBarOverlay: {
                color: config.app.frame.backgroundColor,
                symbolColor: config.app.frame.symbolColor,
                height: config.app.frame.height
            },
            // frame: config.app.window.frame,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                webSecurity: config.app.window.webSecurity,
            }
        })
        if (config.app.mode === 'online') {
            win.loadURL(config.app.loadURL)
        } else {
            win.loadFile(config.project.entry)
        }
        if (config.app.maximize) {
            win.maximize()
        }
        if (config.app.openDevTools) {
            win.webContents.openDevTools()
        }
    }

    const proxy = config.server.host || ''
    const prefix = config.server.host.prefix || ''
    appPath = appPath.replaceAll('\\', '/') + '/build'
    appPath = path.dirname(config.project.entry).replaceAll('\\', '/')

    app.whenReady().then(() => {
        // if (config.app.mode === 'online')
        session.defaultSession.webRequest.onBeforeRequest({urls: [
                "file:///*"
            ]}, (details, callback) => {
            let url = details.url
            const origin = url

            url = url.replaceAll('\\', '/')
            if (url.endsWith('index.html')) {
                callback({})
            } else if (url.indexOf('/assets') === -1) {
                const newUrl = `${proxy}/${details.url.split(':///C:/')[1]}`
                console.info(` -- redirect : ${origin} => ${newUrl}`)
                callback({redirectURL: newUrl})
            } else {
                if (!url.startsWith(`file:///${appPath}/`)) {
                    const newUrl = `file:///${appPath}/${details.url.split(':///C:/')[1]}`
                    console.info(` -- redirect : ${origin} => ${newUrl}`)
                    callback({redirectURL: newUrl})
                } else {
                    callback({})
                }
            }
        })

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


    ipcMain.on('rpc', (e, [method, args]) => {
        invoke(method, args)
            .then(r => win.webContents.send('rpc', r))
            .catch(e => win.webContents.send('rpc', e))
    })

    console.info(`[App] Web UI Localization`)
    console.info(`[App] Web project: ${config.project.entry}`)
}

exec_main()