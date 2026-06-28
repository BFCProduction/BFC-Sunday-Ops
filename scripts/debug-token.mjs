const url = 'https://www.googleapis.com/oauth2/v4/token'
const body = 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + 'x'.repeat(900)
const h = { 'content-type': 'application/x-www-form-urlencoded' }
const hi = { 'content-type': 'application/x-www-form-urlencoded', 'accept-encoding': 'identity' }
console.log('node', process.version)
const nf = (await import('node-fetch')).default
await fetch(url, { method: 'POST', headers: h, body }).then(r => r.text()).then(t => console.log('NATIVE_gzip OK', t.length)).catch(e => console.log('NATIVE_gzip ERR', e.message))
await nf(url, { method: 'POST', headers: h, body }).then(r => r.text()).then(t => console.log('NODEFETCH_gzip OK', t.length)).catch(e => console.log('NODEFETCH_gzip ERR', e.message))
await nf(url, { method: 'POST', headers: hi, body }).then(r => r.text()).then(t => console.log('NODEFETCH_identity OK', t.length)).catch(e => console.log('NODEFETCH_identity ERR', e.message))
