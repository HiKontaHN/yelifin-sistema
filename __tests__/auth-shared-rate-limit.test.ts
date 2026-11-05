import fs from "node:fs";
import path from "node:path";

describe("rate limit compartido en autenticación sensible", () => {
  it.each([
    "app/api/auth/login/route.ts",
    "app/api/auth/send-password-reset/route.ts",
  ])("%s importa y usa sharedRateLimit", (route) => {
    const source = fs.readFileSync(path.join(process.cwd(), route), "utf8");

    expect(source).toMatch(/import \{[^}]*sharedRateLimit[^}]*\} from "@\/lib\/rate-limit"/);
    expect(source).toMatch(/await sharedRateLimit\(/);
    expect(source).not.toMatch(/await rateLimit\(/);
  });
});
