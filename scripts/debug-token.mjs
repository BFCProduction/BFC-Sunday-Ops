const url = 'https://www.googleapis.com/oauth2/v4/token'
console.log('node', process.version)
await fetch(url, { method: 'POST' }).then(r => console.log('NATIVE status', r.status)).catch(e => console.log('NATIVE ERR', e.message, '::', e.cause && e.cause.message))
const nf = (await import('node-fetch')).default
await nf(url, { method: 'POST' }).then(r => console.log('NODEFETCH status', r.status)).catch(e => console.log('NODEFETCH ERR', e.message))
