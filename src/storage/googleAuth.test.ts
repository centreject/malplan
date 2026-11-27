import { describe, expect, test } from "vitest";
import { AuthExpiredError, authorizationUrl, base64Url, DRIVE_SCOPE, exchangeCode, GoogleSession, pkcePair, readRedirect, type GoogleClient } from "./googleAuth";

const client: GoogleClient = { id: "id.apps.googleusercontent.com", secret: "public-secret" };

type TokenAnswer = { access_token?: string; expires_in?: number; refresh_token?: string };

/** A token endpoint that records the form it got and answers from a queue. */
function tokenEndpoint(answers: { status?: number; body: TokenAnswer }[]) {
  const forms: URLSearchParams[] = [];

  const fetcher: typeof fetch = async (_input, init) => {
    forms.push(new URLSearchParams(String(init?.body ?? "")));

    const answer = answers.shift() ?? { status: 500, body: {} };

    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
  };

  return { forms, fetcher };
}

describe("google sign-in", () => {
  test("PKCE: the challenge is the base64url SHA-256 of the verifier (RFC 7636 appendix B)", async () => {
    const bytes = [116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121];

    const pair = await pkcePair((target) => {
      target.set(bytes);

      return target;
    });

    expect(pair).toEqual({ verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" });
    expect(base64Url(new Uint8Array([251, 255]))).toBe("-_8");
  });

  test("the authorization URL asks only for the app folder, with PKCE and offline access", () => {
    const url = new URL(authorizationUrl(client, "http://127.0.0.1:5000", "chal", "st"));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: client.id,
      redirect_uri: "http://127.0.0.1:5000",
      scope: DRIVE_SCOPE,
      code_challenge: "chal",
      code_challenge_method: "S256",
      state: "st",
      access_type: "offline",
    });
  });

  test("the redirect gives the code only with this sign-in's state", () => {
    expect(readRedirect("state=st&code=4%2F0A", "st")).toEqual({ code: "4/0A" });
    expect(readRedirect("state=other&code=x", "st")).toEqual({ error: "state-mismatch" });
    expect(readRedirect("error=access_denied&state=st", "st")).toEqual({ error: "access_denied" });
  });

  test("the code is exchanged with the verifier; a bad answer throws", async () => {
    const { forms, fetcher } = tokenEndpoint([{ body: { access_token: "a1", expires_in: 3600, refresh_token: "r1" } }, { body: { expires_in: 3600 } }]);

    expect(await exchangeCode(client, "c", "ver", "http://127.0.0.1:5000", fetcher, 1_000)).toEqual({ access: "a1", expiresAt: 3_601_000, refresh: "r1" });
    expect(Object.fromEntries(forms[0] ?? [])).toMatchObject({ code: "c", code_verifier: "ver", grant_type: "authorization_code", redirect_uri: "http://127.0.0.1:5000" });
    await expect(exchangeCode(client, "c", "ver", "r", fetcher, 0)).rejects.toThrow();
  });

  test("the session reuses its access token and refreshes a minute before it expires", async () => {
    const { forms, fetcher } = tokenEndpoint([{ body: { access_token: "a1", expires_in: 3600 } }, { body: { access_token: "a2", expires_in: 3600 } }]);
    let now = 0;
    const session = new GoogleSession(client, "r1", fetcher, () => now);

    expect(await session.token()).toBe("a1");
    now = 3_500_000;
    expect(await session.token()).toBe("a1");
    now = 3_550_000;
    expect(await session.token()).toBe("a2");
    expect(forms.map((form) => form.get("grant_type"))).toEqual(["refresh_token", "refresh_token"]);
    expect(forms[0]?.get("refresh_token")).toBe("r1");
  });

  test("a refused refresh (revoked access) throws AuthExpiredError", async () => {
    const { fetcher } = tokenEndpoint([{ status: 400, body: {} }]);

    await expect(new GoogleSession(client, "r1", fetcher, () => 0).token()).rejects.toThrow(AuthExpiredError);
  });

  test("invalidate drops the cached access token so the next call refreshes immediately", async () => {
    const { fetcher } = tokenEndpoint([{ body: { access_token: "a1", expires_in: 3600 } }, { body: { access_token: "a2", expires_in: 3600 } }]);
    const session = new GoogleSession(client, "r1", fetcher, () => 0);

    expect(await session.token()).toBe("a1");
    session.invalidate();
    expect(await session.token()).toBe("a2");
  });
});
