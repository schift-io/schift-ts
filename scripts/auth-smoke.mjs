const baseUrl = (process.env.SCHIFT_API_URL || "http://127.0.0.1:8011").replace(
  /\/+$/,
  "",
);
const email =
  process.env.SCHIFT_SMOKE_EMAIL ||
  `sdk-auth-smoke-${Date.now()}@example.test`;
const password = process.env.SCHIFT_SMOKE_PASSWORD || "SmokePass1234!";

const { Schift } = await import("../dist/index.js");
const auth = Schift.auth({ baseUrl });

const health = await auth.health();
const signup = await auth.signup({
  email,
  password,
  name: "SDK Smoke",
  orgName: "SDK Smoke Org",
  region: "seoul",
});
const me = await auth.me(signup.token);

console.log(
  JSON.stringify(
    {
      baseUrl,
      health: health.status,
      authMe: me.user.email,
      orgs: me.orgs.length,
    },
    null,
    2,
  ),
);
