import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [app, loginRoute, postLogin] = await Promise.all([
  read("client/src/App.tsx"),
  read("client/src/components/LoginRoute.tsx"),
  read("client/src/pages/PostLoginRedirect.tsx"),
]);

test("routes the application root through post-login session resolution", () => {
  assert.match(app, /<Route path="\/">\s*<Redirect to="\/post-login" \/>\s*<\/Route>/);
  assert.doesNotMatch(app, /<Route path="\/">\s*<Redirect to="\/login" \/>\s*<\/Route>/);
});

test("does not show the login form to an already authenticated session", () => {
  assert.match(
    app,
    /<Route path="\/login">[\s\S]*?<LoginRoute>[\s\S]*?<Login \/>[\s\S]*?<\/LoginRoute>/
  );
  assert.match(loginRoute, /const \{ session, loading \} = useAuth\(\)/);
  assert.match(loginRoute, /if \(loading\)[\s\S]*?role="status"/);
  assert.match(loginRoute, /if \(session\)[\s\S]*?<Redirect to="\/post-login" \/>/);
});

test("keeps unauthenticated post-login fallback returning to login", () => {
  assert.match(postLogin, /if \(!session\)[\s\S]*?setLocation\("\/login"\)/);
});
