// use 'deno' as javascript runtime
import * as fs from 'node:fs'
import * as path from "node:path";
import * as process from "node:process";
import * as child_process from 'node:child_process'
import {exists} from "./utils/jlib";
import {GitChange, GitCommit, GitUser} from "./git.generic";
import {dialog, shell} from "electron"

export function exec(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        child_process.exec(cmd,
            (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(stdout);
                console.error(stderr)
            })
    })
}

export function execi(cmd: string, matches: Array<{ question: string, answer: string }> = []): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const child = child_process.exec(cmd)
        const err = {value: ''}
        child.stderr.on('data', (data) => {
            err.value += data + '\n'
        })
        child.stdout.on('data', (data) => {
            for (let i = 0; i < matches.length; i++) {
                const match = matches[i]
                if (data.toLowerCase().indexOf(match.question) !== -1) {
                    child.stdin.write(`${match.answer}\n`, 'utf-8')
                    break
                }
            }
        })
        child.on('exit', (code) => {
            code !== 0 ? reject(err.value) : resolve(true)
        })
    })
}

const gitProjectConfig = {ref: null}

export async function getOpenPaths(): Promise<Array<string>> {
    return ((await dialog.showOpenDialog({
        title: "GitGuard",
        properties: ['openDirectory']
    })) || {filePaths: []})['filePaths'];
    /* Just for test */
    // return ["C:\\jqs\\dataflow"]
}

export function openExternalLink(url: string) {
    return shell.openExternal(url)
}

export function enter(dir: string) {
    process.chdir(dir)
}

export function enterPath(path: string) {
    process.chdir(path);
    return process.cwd() === path;
}

export async function getBranches() {
    const branch = {branches: [], currentBranch: null};
    (await exec('git branch'))
        .split('\n')
        .filter(s => s.trim() !== '')
        .forEach(line => {
            let br = line.trim()
            if (line.startsWith('*')) {
                br = line.substring(1).trim()
                branch.currentBranch = br
            }
            branch.branches.push(br)
        })
    return branch
}

export async function getFinalCommits() {
    return (await exec('git branch -avv --format="%(refname:short) %(objectname)"'))
        .split('\n')
        .filter(s => s.trim() !== '')
        .map(line => line.split(' '))
        .filter(arr => arr.length === 2)
        .reduce((prev, c) =>
            ({...prev, [c[0]]: c[1]}), {})
}

/**
 * @deprecated
 */
export async function getBranches_r() {
    const message = await exec('git branch -r')
    const lines = message.split('\n')
    const r = {}
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
    })
    return r
}

export async function getProject() {
    const cfg = await readConfig();
    gitProjectConfig.ref = cfg
    const br = await getBranches()
    const diffs = await git_diff()
    const diffsMap = new Map<string, GitChange>()
    diffs.forEach(df => diffsMap.set(df.file, df))
    const changes = await getChangeStatus()
    changes.forEach(df => {
        if (diffsMap.has(df.file))
            df.places = diffsMap.get(df.file).places
    })
    return {
        "name": path.basename(process.cwd()),
        "localBranches": br.branches,
        "currentBranch": br.currentBranch,
        "upstreams": extractUpstream(cfg),
        "remoteRepositories": await getBranches_r(),
        "history": await getCommits(),
        "track": await getCommits('--all'),
        "changes": changes,
        "heads": await getFinalCommits(),
    }
}

export async function checkout(branch: string) {
    const message = await exec(`git checkout ${branch}`)
    return message.trim().toLowerCase().startsWith('switched to branch')
}

export async function gitAdd(filepath: string) {
    await exec(`git add ${filepath}`)
    return true
}

export async function gitUnstage(filepath: string) {
    await exec(`git restore --staged ${filepath}`)
    return true
}

export async function gitCommit(msg: string) {
    await exec(`git commit -m ${msg}`)
    return true
}

export async function gitPush(remote: string = '', branch: string = '') {
    return await execi(
        remote !== '' && branch !== '' ? `git push --set-upstream ${remote} ${branch}` : "git push",
        [
            {question: 'username', answer: gitProjectConfig.ref['user']['name']},
            {question: 'password', answer: gitProjectConfig.ref['user']['password']},
            {question: 'mail', answer: gitProjectConfig.ref['user']['mail']},
        ])
}

export async function gitPull(remote: string = '', branch: string = '') {
    return await execi(remote !== '' && branch !== '' ? `git pull --set-upstream ${remote} ${branch}` : "git pull",
        [
            {question: 'username', answer: gitProjectConfig.ref['user']['name']},
            {question: 'password', answer: gitProjectConfig.ref['user']['password']},
            {question: 'mail', answer: gitProjectConfig.ref['user']['mail']},
        ])
}

export async function gitReset() {
    // Todo:
    await exec(`git reset`)
    return true
}

export async function getCommits(options: string = ''): Promise<Array<GitCommit>> {
    const message = await exec(`git log ${options} --date=iso --pretty=format:%Creset+++%T%Creset+++%P%Creset+++%H%Creset+++%an%Creset+++%ae%Creset+++%ad%Creset+++%s`)
    if (!message.startsWith('+++')) return []
    return message
        .split('\n')
        .map(s => s.trim())
        .filter(s => s !== '')
        .map(line => {
            const arr = line.split('+++').slice(1)
            const commit = new GitCommit()
            commit.id = arr[2];
            commit.idParent = arr[1];
            commit.idTree = arr[0];
            commit.author = new GitUser(arr[3], arr[4]);
            commit.date = Date.parse(arr[5]);
            commit.message = arr[6]
            return commit
        })
}

export async function gitShow(id: string) {
    const message = await exec(`git show ${id}`)
    let i = 0;
    const diffs = []
    while (i < message.length) {
        const p0 = message.substring(i).indexOf('\ndiff ')
        const p1 = message.substring(i + p0 + 1).indexOf('\ndiff ')
        if (p0 === -1) break
        const text = ((p1 === -1) ? message.substring(i + p0 + 1) : message.substring(i + p0 + 1, i + p0 + 1 + p1));
        diffs.push(text)
        i = ((p1 === -1) ? message.length : (i + p0 + 1 + p1))
    }
    return diffs.map(d => GitChange.parse(d))
}

function __dumpTo(_lines: Array<string>, _i: number, _option: string, _arr: Array<string>) {
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

export async function getChangeStatus(): Promise<Array<GitChange>> {
    const message = await exec('git status')
    const lines = message.split('\n')
    const status = {staged: [], unstaged: [], untracked: []}
    if (__dumpTo(lines, 0, 'changes to be committed:', status.staged)) {
        status.staged = status.staged.map(s => {
            const pi = s.indexOf(':')
            return new GitChange(s.substring(0, pi).trim(), s.substring(pi + 1).trim()).setStaged(true).dump()
        })
    }
    if (__dumpTo(lines, 0, 'changes not staged for commit:', status.unstaged)) {
        status.unstaged = status.unstaged.map(s => {
            const pi = s.indexOf(':')
            return new GitChange(s.substring(0, pi).trim(), s.substring(pi + 1).trim()).setStaged(false).dump()
        })
    }
    if (__dumpTo(lines, 0, 'untracked files:', status.untracked)) {
        status.untracked = status.untracked.map(s => {
            return new GitChange('new file', s.trim()).setStaged(false).dump()
        })
    }
    return [...status.staged, ...status.unstaged, ...status.untracked]
}

/**
 * Obtain current changing states of all files
 */
export async function git_diff(path?: string) {
    return GitChange.parseDiffs(await exec(`git diff ${path || ''}`))
}

export async function gitIgnore(filepath) {
    fs.appendFileSync('.gitignore', `\n${filepath}\n`, 'utf-8')
    return true
}

export async function getRecent() {
    const cfg = await readConfig()
    let repos = []
    if (exists(cfg, 'magic') && exists(cfg['magic'], 'recentrepo')) {
        const x = cfg['magic']['recentrepo']
        repos = (x instanceof Array ? x : [x])
    }
    if (repos.length > 8)
        repos = repos.reverse().slice(0, 8)
    return repos
}

export async function addRecent(path) {
    await exec(`git config --global --add magic.recentrepo ${path}`)
}

export async function readConfig() {
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
    message
        .split('\n')
        .map(s => s.trim())
        .filter(s => s !== '')
        .forEach(line => {
            const eqi = line.indexOf('=')
            const key = line.substring(0, eqi)
            const value = line.substring(eqi + 1)
            set(key, value)
        })
    gitProjectConfig.ref = cfg
    return cfg
}

export function extractUpstream(cfg: any) {
    const upstreams = {}
    if (exists(cfg, 'branch')) {
        Object
            .keys(cfg['branch'])
            .forEach(br => upstreams[br] = {
                remote: cfg['branch'][br]['remote'],
                branch: cfg['branch'][br]['merge'].split('/').pop()
            })
    }
    return upstreams
}

export function extractRemote(cfg: any) {
    const remotes = {}
    if (exists(cfg, 'remote')) {
        Object
            .keys(cfg['remote'])
            .forEach(remote =>
                remotes[remote] = cfg['remote'][remote]['url'])
    }
    return remotes
}

/**
 * Todo: stash implementation
 */
export async function git_stash() {
    // git stash -m "..."
    // git stash list
    // git stash pop
    // git stash push xxx_file
    // git stash apply stash@{0}
    // git stash show -p stash@{0}
}

// whether we need?
export async function git_fetch() {
}

export async function git_merge() {
}

export async function invoke(method: string, args: Array<any>) {
    const rpcHandles = [
        {id: 'git_info'     , hd: async (...args) => await getProject()},
        {id: 'git_checkout' , hd: async (...args) => await checkout(args[0])},
        {id: 'git_ignore'   , hd: async (...args) => await gitIgnore(args[0])},
        {id: 'git_add'      , hd: async (...args) => await gitAdd(args[0])},
        {id: 'git_unstage'  , hd: async (...args) => await gitUnstage(args[0])},
        {id: 'git_show'     , hd: async (...args) => await gitShow(args[0])},
        {id: 'git_commit'   , hd: async (...args) => await gitCommit(args[0])},
        {id: 'git_push'     , hd: async (...args) => await gitPush(...args)},
        {id: 'git_pull'     , hd: async (...args) => await gitPull(...args)},
        {id: 'git_recent'   , hd: async (...args) => getRecent()},
        {id: 'git_open_repo', hd: async (...args) => await getOpenPaths()},
        {id: 'git_enter_repo'   , hd: async (...args) => enterPath(args[0])},
        {id: 'git_add_recent'   , hd: async (...args) => addRecent(args[0])},
        {id: 'git_open_external', hd: (...args) => openExternalLink(args[0])},
    ]
    for (let i = 0; i < rpcHandles.length; i++) {
        if (method === rpcHandles[i].id) {
            try {
                const r = await (rpcHandles[i].hd(...args))
                console.info(`[Git] ${method}(${args.map(a => a.toString()).join(',')}) ->`, JSON.stringify(r).length > 50 ? (JSON.stringify(r).substring(0, 12) + '... ...') : r)
                return r
            } catch (e) {
                console.error(e)
                return {error: e.toString()}
            }
        }
    }
    return {error: `No such method : ${method}`}
}
