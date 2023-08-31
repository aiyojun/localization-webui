export class GitUser {
    constructor(readonly name: string, readonly mail: string) {
    }
    dump() {
        return {name: this.name, mail: this.mail}
    }
}

export class GitChange {
    staged: boolean = false;
    places: Array<{text: string; location: string}> = []
    constructor(readonly flag: string, readonly file: string) {}
    setStaged(s: boolean) {
        this.staged = s
        return this
    }
    setPlaces(places: Array<{text: string; location: string}>) {
        this.places = places
        return this
    }
    dump() {
        return {staged: this.staged, flag: this.flag, file: this.file, places: this.places}
    }

    static parseDiffs(text: string): Array<GitChange> {
        return text.split('\ndiff ')
            .filter(x => x.trim() !== '')
            .map((x, i) => i === 0 ? x : ('diff ' + x))
            .map(diffText => GitChange.parse(diffText))
    }
    static parse(text: string) {
        const extractFlag = (_text: string) => {
            let flag = 'modified'
            if (_text.indexOf('\nnew file') > -1) flag = 'new file'
            else if (_text.indexOf('\ndeleted') > -1) flag = 'deleted'
            else if (_text.indexOf('\nrename') > -1) flag = 'rename'
            else if (_text.indexOf(' mode ') > -1)
                flag = _text.split(' mode ')[0].split('\n').pop()
            return flag
        }
        if (!text.startsWith('diff '))
            throw new Error(`Unsolved diff text: ${text}`)
        if (text.indexOf('\n--- ') === -1) {
            const filepath = text.split('\n')[0].split(' ').pop().substring(2)
            return new GitChange(extractFlag(text), filepath)
        }
        const [section0, section_0] = text.split('\n--- ')
        const [_, section_1] = section_0.split('\n+++ ')
        const [__, ...lines] = section_1.split('\n')

        const section_head = section0.split('\n')
        const filepath = section_head[0].split(' ').pop().substring(2)
        const gd = new GitChange(extractFlag(section0), filepath)

        let lineNum = 0
        let ss = ''
        let location = ''
        while (lineNum < lines.length) {
            const line = lines[lineNum]
            if (line.startsWith('@@ ')) {
                if (ss !== '')
                    gd.places.push({text: ss, location})
                location = line.substring(3, line.indexOf('@@', 2)).trim()
                ss = line.substring(line.indexOf('@@', 2) + 2)
            } else {
                ss += '\n' + line
            }
            lineNum++
        }
        if (ss !== '')
            gd.places.push({text: ss, location})
        return gd
    }
}

export class GitCommit {
    id: string;
    idTree: string;
    idParent: string;
    author: GitUser;
    date: number;
    message: string;
    dump() {
        return {
            id: this.id,
            idTree: this.idTree,
            idParent: this.idParent,
            author: this.author.dump(),
            date: this.date,
            message: this.message
        }
    }
    static build(data: any) {
        const gc = new GitCommit()
        gc.id = data['id']
        gc.idTree = data['idTree']
        gc.idParent = data['idParent']
        gc.author = new GitUser(data['author']['name'], data['author']['mail'])
        gc.date = data['date']
        gc.message = data['message'].trim()
        return gc
    }
}

export function mapChangeColor(flag: string) {
    const handles = [
        {satisfy: () => flag === 'modified', entry: () => '#ff832e'},
        {satisfy: () => flag === 'new file', entry: () => '#00a6ff'},
        {satisfy: () => flag.indexOf('rename') > -1, entry: () => '#51e7ad'},
        {satisfy: () => flag.indexOf('deleted') > -1, entry: () => '#ff5757'},
        {satisfy: () => flag === 'M', entry: () => 'orange'},
        {satisfy: () => flag === 'D', entry: () => 'red'},
        {satisfy: () => flag === 'A', entry: () => 'blue'},
        {satisfy: () => flag === 'R', entry: () => 'green'},
        {satisfy: () => flag === 'C', entry: () => 'grey'},
        {satisfy: () => flag === 'U', entry: () => 'purple'},
        {satisfy: () => flag === 'T', entry: () => 'indigo'},
    ]
    for (let i = 0; i < handles.length; i++) {
        const hd = handles[i]
        if (hd.satisfy()) {
            return hd.entry()
        }
    }
    return 'white'
}

export function mapChangeIcon(flag: string) {
    const handles = [
        {satisfy: () => flag === 'modified', entry: () => 'edit'},
        {satisfy: () => flag === 'new file', entry: () => 'file-add'},
        {satisfy: () => flag.indexOf('rename') > -1, entry: () => 'file-rename'},
        {satisfy: () => flag.indexOf('delete') > -1, entry: () => 'file-delete'},
        {satisfy: () => flag === 'M', entry: () => 'edit'},
        {satisfy: () => flag === 'D', entry: () => 'file-delete'},
        {satisfy: () => flag === 'A', entry: () => 'file-add'},
        {satisfy: () => flag === 'R', entry: () => 'code'},
        {satisfy: () => flag === 'C', entry: () => 'code'},
        {satisfy: () => flag === 'U', entry: () => 'code'},
        {satisfy: () => flag === 'T', entry: () => 'code'},
    ]
    for (let i = 0; i < handles.length; i++) {
        const hd = handles[i]
        if (hd.satisfy()) {
            return hd.entry()
        }
    }
    return 'code'
}

