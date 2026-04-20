#!/usr/bin/env node
/**
 * BFC Sunday Ops — YouTube OAuth Setup
 *
 * One-time script to get a YouTube refresh token for the fetch-youtube importer.
 * Run this once, save the refresh token to .env.local and Supabase secrets, then
 * this script is no longer needed.
 *
 * Prerequisites:
 *   1. YouTube Analytics API enabled in Google Cloud Console
 *   2. YouTube Data API v3 enabled in Google Cloud Console
 *   3. OAuth consent screen configured with these scopes:
 *        https://www.googleapis.com/auth/youtube.readonly
 *        https://www.googleapis.com/auth/yt-analytics.readonly
 *   4. OAuth 2.0 client created (type: Desktop app)
 *      → Download the JSON or copy the Client ID and Client Secret
 *
 * Usage:
 *   YOUTUBE_CLIENT_ID=... YOUTUBE_CLIENT_SECRET=... node scripts/youtube-auth.js
 *
 * Or add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to .env.local first.
 */

import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'

const __dirname = dirname(fileURLToPath(import.meta.url))

try {
  const envPath = join(__dirname, '..', '.env.local')
  if (existsSync(envPath)) {
    readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const [key, ...rest] = line.split('=')
      if (key?.trim() && rest.length) process.env[key.trim()] = rest.join('=').trim()
    })
  }
} catch {}

const CLIENT_ID     = process.env.YOUTUBE_CLIENT_ID
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are required.')
  console.error('Add them to .env.local or pass as environment variables.')
  process.exit(1)
}

const REDIRECT_URI = 'http://localhost:9876/oauth2callback'
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
].join(' ')

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id',     CLIENT_ID)
authUrl.searchParams.set('redirect_uri',  REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope',         SCOPES)
authUrl.searchParams.set('access_type',   'offline')
authUrl.searchParams.set('prompt',        'consent')  // force refresh_token to be issued

console.log('\nBFC Sunday Ops — YouTube OAuth Setup')
console.log('=====================================')
console.log('\nOpen this URL in a browser and authorize with the account that manages the BFC YouTube channel:\n')
console.log(authUrl.toString())
console.log('\nWaiting for redirect on http://localhost:9876 ...\n')

// Spin up a local server to catch the OAuth redirect
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:9876')
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404); res.end(); return
  }

  const code  = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`<h2>Authorization failed: ${error}</h2><p>Check the terminal for details.</p>`)
    console.error(`\nAuthorization failed: ${error}`)
    server.close()
    process.exit(1)
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  })
  const tokens = await tokenRes.json()

  if (tokens.error) {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`<h2>Token exchange failed: ${tokens.error}</h2><p>${tokens.error_description ?? ''}</p>`)
    console.error('\nToken exchange failed:', tokens.error, tokens.error_description ?? '')
    server.close()
    process.exit(1)
  }

  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end('<h2>Success! You can close this tab.</h2><p>Check your terminal for the refresh token.</p>')

  console.log('\n✓ Authorization successful!\n')
  console.log('Add these to .env.local and to Supabase project secrets:\n')
  console.log(`YOUTUBE_CLIENT_ID=${CLIENT_ID}`)
  console.log(`YOUTUBE_CLIENT_SECRET=${CLIENT_SECRET}`)
  console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`)
  console.log('\nKeep the refresh token secret — it grants read access to your YouTube channel analytics.')

  server.close()
})

server.listen(9876, () => {})
server.on('error', err => {
  console.error('Could not start local server on port 9876:', err.message)
  console.error('Make sure nothing else is using that port.')
  process.exit(1)
})
