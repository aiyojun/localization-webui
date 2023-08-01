// use 'deno' as javascript runtime
import * as fs from 'node:fs'
import * as path from "node:path";
import * as process from "node:process";
import * as child_process from 'node:child_process'
import {exists} from "./jlib";
import {GitChange, GitCommit, GitUser} from "./git.generic";

export function exec(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        child_process.exec(cmd,
            (error, stdout, stderr) => {
            if (error) {reject(error);return;}
            resolve(stdout);console.error(stderr)})
    })
}

export async function git_branch() {
    const message = await exec('git branch')
    const branch = {branches: [], currentBranch: null}
    message.split('\n').forEach(line => {
        let br = line.trim()
        if (br.length === 0) return
        if (br.startsWith('*')) {
            br = br.substring(1).trim()
            branch.currentBranch = br
        }
        branch.branches.push(br)
    })
    return branch
}

export async function git_branch_r() {
    const message = await exec('git branch -r')
    const lines = message.split('\n')
    const r = {}//new Map<string, Set<string>>()
    lines.forEach(line => {
        if (line.trim().length === 0)
            return
        if (line.indexOf('->') !== -1) {
            return
        }
        const arr = line.trim().split('/')
        if (!exists(r, arr[0]))
            r[arr[0]] = []
        r[arr[0]].push(arr[1])
        // if (!r.has(arr[0]))
        //     r.set(arr[0], new Set<string>())
        // r.get(arr[0]).add(arr[1])
    })
    return r
}

export function enter(dir: string) {
    process.chdir(dir)
}

export async function git_info() {
    enter('C:\\gitlab\\widget-frontend')

    const br = await git_branch()
    const diffs = await git_diff()
    const diffsMap = new Map<string, GitChange>()
    diffs.forEach(df => diffsMap.set(df.file, df))
    const changes = await git_status_v2()
    changes.forEach(df => {
        if (diffsMap.has(df.file))
            df.places = diffsMap.get(df.file).places
    })
    const upstreams = git_parse_config().upstreams
    return {
        "name": path.basename(process.cwd()),
        "currentBranch": br.currentBranch,
        "upstreams": upstreams,
        "localBranches": br.branches,
        "remoteRepositories": await git_branch_r(),
        "history": await git_log(),
        "changes": changes,
    }
}

export async function git_checkout(branch: string) {
    const message = await exec(`git checkout ${branch}`)
    return message.trim().toLowerCase().startsWith('switched to branch')
}

export async function git_add(filepath: string) {
    try {
        const message = await exec(`git add ${filepath}`)
        return true
    } catch (e) {
        return false
    }
}

export async function git_unstage(filepath: string) {
    try {
        const message = await exec(`git restore --staged ${filepath}`)
        return true
    } catch (e) {
        return false
    }
}

export async function git_commit(msg: string) {
    try {
        const message = await exec(`git commit -m ${msg}`)
        return true
    } catch (e) {
        return false
    }
}

export async function git_push() {
    // TODO: ...
    try {
        const message = await exec(`git push`)
        return true
    } catch (e) {
        return false
    }
}

export async function git_pull() {
    // TODO: ...
    // return new Promise((resolve, reject) => {
    //     const child = child_process.exec(`git pull`)
    //     child.stdout.on('data', (data) => {
    //         if (data.toLowerCase().indexOf('username') > -1) {
    //             child.stdin.write(`${}\n`, 'utf-8')
    //         } else if (data.toLowerCase().indexOf('password') > -1) {
    //             child.stdin.write(`${}\n`, 'utf-8')
    //         }
    //     })
    //     child.on('exit', (code) => {
    //         resolve(code)
    //     })
    // })
    try {
        const message = await exec(`git pull`)
        return true
    } catch (e) {
        return false
    }
}

export async function git_reset() {
    try {
        const message = await exec(`git reset`)
        return true
    } catch (e) {
        return false
    }
}

export function git_parse_config() {
    const r = {upstreams: {},}
    const configs = fs.readFileSync(path.join('.git', 'config')).toString()
        .split('\n[').map((s, i) => i === 0 ? s : ('[' + s))
    configs.forEach(config => {
        const lines = config.split('\n')
        const head = lines[0]
        const brCfg = {}
        for (let i = 1; i < lines.length; i++) {
            const kv = lines[i].split('=').map(s => s.trim())
            brCfg[kv[0]] = kv[1]
        }
        if (head.startsWith('[branch') && exists(brCfg, 'remote') && exists(brCfg, 'merge')) {
            const localBranch = head.substring(9, head.length - 2)
            r.upstreams[localBranch] = {remote: brCfg['remote'], branch: brCfg['merge'].split('/').pop()}
        }
    })
    return r
}

export async function git_log(): Promise<Array<GitCommit>> {
    const log = await exec(`git log --date=iso --pretty=format:%Creset+++%T%Creset+++%P%Creset+++%H%Creset+++%an%Creset+++%ae%Creset+++%ad%Creset+++%s`)
    if (!log.startsWith('+++')) {
        console.error('error git log : ', log)
        return []
    }
    return log.split('\n').map(line => {
        if (line.trim().length === 0)
            return
        const arr =  line.split('+++').slice(1)
        const commit = new GitCommit()
        commit.idTree = arr[0]
        commit.idParent = arr[1]
        commit.id = arr[2]
        commit.author = new GitUser(arr[3], arr[4])
        commit.date = Date.parse(arr[5]) // date: 2023-07-14T03:31:05.000Z,
        commit.message = arr[6]
        // console.info(commit)
        return commit
    })
}

export async function git_show(id: string) {
    const message = await exec(`git show ${id}`)
    let i = 0; let count = 0;
    const diffs = []
    // console.info(`git show .... ${message.length}`)
    while (i < message.length) {
        const p = message.substring(i).indexOf('\ndiff ')
        if (p === -1) break
        const text = message.substring(i, i + p)
        // if (text === '') break
        count++
        if (count !== 1) diffs.push(text)
        i += p + 1
    }
    // console.info("diffs :", diffs)
    return diffs.map(d => GitChange.parse(d))
}

export async function git_status() {
    /*
M packages/widget-frontend-beta/src/widgets-base/element-ui.tsx
M packages/widget-frontend-core/package.json
M pub.js
     */
    const message = await exec('git status --short')
    const lines = message.split('\n')
        .map(m => m.trim())
        .filter(m => m.length !== 0)
    return lines.map(line => (
        new GitChange(line[0], line.substring(1).trim())
        // {flag: line[0], file: line.substring(1).trim()}
    ))
}

function searchUntil(_lines: Array<string>, _i: number, _option: string, _arr: Array<string>) {
    let intercept = false
    for (let j = _i; j < _lines.length; j++) {
        if (_lines[j].toLowerCase().startsWith(_option)) {
            intercept = true
            continue
        }
        if (intercept) {
            if (_lines[j].trim().startsWith('(use')) continue
            if (_lines[j].trim() === '') return j + 1
            _arr.push(_lines[j])
        }
    }
    return _lines.length
}

export async function git_status_v2(): Promise<Array<GitChange>> {
    const message = await exec('git status')
    const lines = message.split('\n')

    const status = {
        staged: [],
        unstaged: [],
        untracked: [],
    }
    function dumpTo(_lines: Array<string>, _i: number, _option: string, _arr: Array<string>) {
        let intercept = false
        for (let j = _i; j < _lines.length; j++) {
            if (_lines[j].toLowerCase().startsWith(_option)) {
                intercept = true
                continue
            }
            if (intercept) {
                if (_lines[j].trim().startsWith('(use')) continue
                if (_lines[j].trim() === '') return true // j + 1
                _arr.push(_lines[j])
            }
        }
        return false // _lines.length
    }
    if (dumpTo(lines, 0, 'changes to be committed:', status.staged)) {
        status.staged = status.staged.map(s => {
            const pi = s.indexOf(':')
            return new GitChange(s.substring(0, pi).trim(), s.substring(pi + 1).trim()).setStaged(true).dump()
        })
    }
    if (dumpTo(lines, 0, 'changes not staged for commit:', status.unstaged)) {
        status.unstaged = status.unstaged.map(s => {
            const pi = s.indexOf(':')
            return new GitChange(s.substring(0, pi).trim(), s.substring(pi + 1).trim()).setStaged(false).dump()
        })
    }
    if (dumpTo(lines, 0, 'untracked files:', status.untracked)) {
        status.untracked = status.untracked.map(s => {
            return new GitChange('new file', s.trim()).setStaged(false).dump()
        })
    }
    return [...status.staged, ...status.unstaged, ...status.untracked]
}

export async function git_remote() {
    const message = await exec('git remote -v')
    const lines = message.split('\n').map(m => m.trim()).filter(m => m.length !== 0)
    const remotes = new Map<string, string>()
    lines.forEach(line => {
        const arr = line.split(/[ \t]/).filter(s => s !== '')
        remotes.set(arr[0], arr[1])
    })
    return remotes
}

export async function git_diff(path?: string) {
    return GitChange.parseDiffs(await exec(`git diff ${path || ''}`))
}



export async function git_stash() {
    // git stash -m "..."
    // git stash list
    // git stash pop
    // git stash push xxx_file
    // git stash apply stash@{0}
    // git stash show -p stash@{0}
}



class JFile {
    text: string = ''
    constructor(readonly path) {

    }
    append(text: string) {
        this.text += text + "\n"
        return this
    }
    print() {
        console.info(this.text)
    }
    flush() {
        fs.writeFileSync(this.path, this.text)
    }
}

// export async function git_pull() {}
// export async function git_push() {}
export async function git_fetch() {}
export async function git_merge() {}

export async function git_ignore(filepath) {
    const fd = fs.openSync('.gitignore', 'a+')
    fs.appendFileSync(fd, filepath, 'utf8')
    fs.closeSync(fd)
}

export async function git_config_list() {
    const message = await exec(`git config --list`)
    const cfg = {}
    const setDefault = (_o, _k, _v) => {
        if (!exists(_o, _k))
            _o[_k] = _v
        else if (_o[_k] instanceof Array)
            _o[_k] = [..._o[_k], _v]
        else
            _o[_k] = [_o[_k], _v]
    }
    const set = (_key, _value) => {
        const chain = _key.split('.')
        let k = 0
        let o = cfg
        while (k < chain.length) {
            if (k === chain.length - 1) {
                setDefault(o, chain[k], _value)
                break
            }
            if (!exists(o, chain[k]))
                o[chain[k]] = {}
            o = o[chain[k]]
            k++
        }
    }
    message.split('\n').map(s => s.trim()).filter(s => s !== '').forEach(line => {
        let eqi = line.indexOf('=')
        const key = line.substring(0, eqi)
        const value = line.substring(eqi + 1)
        set(key, value)
    })
    return cfg
}


// export async function ask(): Promise<number> {
//     return new Promise((resolve, reject) => {
//         const interactive = 'python ./main.py'
//         const child = child_process.exec(interactive)
//         child.stdout.on('data', (data) => {
//             console.info("stdout :", data)
//             if (data.indexOf('username') > -1) {
//                 child.stdin.write('aaa\n', 'utf-8')
//             } else if (data.indexOf('password') > -1) {
//                 child.stdin.write('bbb\n', 'utf-8')
//             }
//         })
//         child.on('exit', (code) => {
//             resolve(code)
//         })
//     })
// }
//
// console.info(`ask...`)
// console.info(await ask())
// console.info(`ask...over`)
// console.info(JSON.stringify(await git_config_list(), null, 2))

export async function invoke(method: string, args: Array<any>) {
    const rpcHandles = [
        {id: 'git_info', hd: async (...args) => await git_info()},
        {id: 'git_checkout', hd: async (...args) => await git_checkout(args[0])},
        {id: 'git_ignore', hd: async (...args) => await git_ignore(args[0])},
        {id: 'git_add', hd: async (...args) => await git_add(args[0])},
        {id: 'git_unstage', hd: async (...args) => await git_unstage(args[0])},
        {id: 'git_reset', hd: async (...args) => await git_reset()},
        {id: 'git_show', hd: async (...args) => await git_show(args[0])},
        {id: 'git_commit', hd: async (...args) => await git_commit(args[0])},
        {id: 'git_push', hd: async (...args) => await git_push()},
        {id: 'git_pull', hd: async (...args) => await git_pull()},
    ]
    for (let i = 0; i < rpcHandles.length; i++) {
        if (method === rpcHandles[i].id) {
            console.info(`[gitx] run : ${method}`)
            try {
                return await (rpcHandles[i].hd(...args))
            } catch (e) {
                console.error(e)
                return {error: e.toString()}
            }
        }
    }
    return {error: `No such method : ${method}`}
}