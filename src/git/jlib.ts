import * as CryptoJS from "crypto-js";

export function exists(o: any, k?: string) {
    if (k === undefined)
        return o !== undefined && o !== null
    return typeof o === 'object' && o !== null
        && !(o instanceof Array) && Object.keys(o).includes(k)
        && o[k] !== undefined && o[k] !== null
}

export function clone(o: any) {
    return JSON.parse(JSON.stringify(o))
}

export function hash(o: any) {
    return CryptoJS.MD5(JSON.stringify(o)).toString()
}