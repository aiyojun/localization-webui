
const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('rpc', {invoke: (method, args) => new Promise((resolve, reject) => {
        ipcRenderer.once('rpc', (e, resp) => resolve(resp))
        ipcRenderer.send('rpc', [method, args])
    })})

contextBridge.exposeInMainWorld('fakeAxios', {
    get: (url) => new Promise((resolve) => {
        console.info(`[fake] axios get ${url}`)
        ipcRenderer.once('http', (e, resp) => resolve({data: resp}))
        ipcRenderer.send('http', ['GET', url])
    }),
    post: (url, data) => new Promise((resolve) => {
        console.info(`[fake] axios post ${url} ${JSON.stringify(data)}`)
        ipcRenderer.once('http', (e, resp) => resolve({data: resp}))
        ipcRenderer.send('http', ['POST', url, data])
    }),
    delete:(url) => new Promise((resolve) => {
        ipcRenderer.once('http', (e, resp) => resolve({data: resp}))
        ipcRenderer.send('http', ['DELETE', url])
    }),
})

