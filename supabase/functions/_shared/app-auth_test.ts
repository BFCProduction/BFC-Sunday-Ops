import { assertEquals } from 'jsr:@std/assert@1'
import { hasAccessLevel, type AppAccessLevel } from './app-auth.ts'

function user(access_level: AppAccessLevel) {
  return { access_level }
}

Deno.test('users only satisfy user-level access', () => {
  assertEquals(hasAccessLevel(user('user'), 'user'), true)
  assertEquals(hasAccessLevel(user('user'), 'manager'), false)
  assertEquals(hasAccessLevel(user('user'), 'admin'), false)
})

Deno.test('managers inherit user permissions without admin permissions', () => {
  assertEquals(hasAccessLevel(user('manager'), 'user'), true)
  assertEquals(hasAccessLevel(user('manager'), 'manager'), true)
  assertEquals(hasAccessLevel(user('manager'), 'admin'), false)
})

Deno.test('admins satisfy every access level', () => {
  assertEquals(hasAccessLevel(user('admin'), 'user'), true)
  assertEquals(hasAccessLevel(user('admin'), 'manager'), true)
  assertEquals(hasAccessLevel(user('admin'), 'admin'), true)
})
